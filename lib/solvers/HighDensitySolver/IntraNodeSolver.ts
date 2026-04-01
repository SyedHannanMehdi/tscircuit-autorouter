import { ConnectivityMap } from "circuit-json-to-connectivity-map"
import type { GraphicsObject } from "graphics-debug"
import { cloneAndShuffleArray } from "lib/utils/cloneAndShuffleArray"
import { getBoundsFromNodeWithPortPoints } from "lib/utils/getBoundsFromNodeWithPortPoints"
import { getMinDistBetweenEnteringPoints } from "lib/utils/getMinDistBetweenEnteringPoints"
import type {
  HighDensityIntraNodeRoute,
  NodeWithPortPoints,
} from "../../types/high-density-types"
import { BaseSolver } from "../BaseSolver"
import { safeTransparentize } from "../colors"
import { HighDensityHyperParameters } from "./HighDensityHyperParameters"
import { SingleHighDensityRouteSolver } from "./SingleHighDensityRouteSolver"
import { SingleHighDensityRouteSolver6_VertHorzLayer_FutureCost } from "./SingleHighDensityRouteSolver6_VertHorzLayer_FutureCost"

type ConnectionPoint = { x: number; y: number; z: number }

const pointKey = (point: ConnectionPoint) =>
  `${point.x.toFixed(6)},${point.y.toFixed(6)},${point.z}`

const dedupeConnectionPoints = (points: ConnectionPoint[]) => {
  const seen = new Set<string>()
  const deduped: ConnectionPoint[] = []

  for (const point of points) {
    const key = pointKey(point)
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push(point)
  }

  return deduped
}

export class IntraNodeRouteSolver extends BaseSolver {
  override getSolverName(): string {
    return "IntraNodeRouteSolver"
  }

  nodeWithPortPoints: NodeWithPortPoints
  colorMap: Record<string, string>
  unsolvedConnections: {
    connectionName: string
    points: { x: number; y: number; z: number }[]
  }[]

  totalConnections: number
  solvedRoutes: HighDensityIntraNodeRoute[]
  failedSubSolvers: SingleHighDensityRouteSolver[]
  hyperParameters: Partial<HighDensityHyperParameters>
  minDistBetweenEnteringPoints: number
  viaDiameter: number
  traceWidth: number
  obstacleMargin: number

  /**
   * Optional per-connection trace width overrides.
   * Keys are connection names or root connection names.
   * When set, the mapped width is used instead of the global traceWidth.
   */
  connectionTraceWidthMap: Map<string, number>

  activeSubSolver: SingleHighDensityRouteSolver | null = null
  connMap?: ConnectivityMap

  // Legacy compat
  get failedSolvers() {
    return this.failedSubSolvers
  }

  // Legacy compat
  get activeSolver() {
    return this.activeSubSolver
  }

  constructor(params: {
    nodeWithPortPoints: NodeWithPortPoints
    colorMap?: Record<string, string>
    hyperParameters?: Partial<HighDensityHyperParameters>
    connMap?: ConnectivityMap
    viaDiameter?: number
    traceWidth?: number
    obstacleMargin?: number
    connectionTraceWidthMap?: Map<string, number>
  }) {
    const { nodeWithPortPoints, colorMap } = params
    super()
    this.nodeWithPortPoints = nodeWithPortPoints
    this.colorMap = colorMap ?? {}
    this.solvedRoutes = []
    this.hyperParameters = params.hyperParameters ?? {}
    this.failedSubSolvers = []
    this.connMap = params.connMap
    this.viaDiameter = params.viaDiameter ?? 0.3
    this.traceWidth = params.traceWidth ?? 0.15
    this.obstacleMargin = params.obstacleMargin ?? 0.15
    this.connectionTraceWidthMap = params.connectionTraceWidthMap ?? new Map()
    const unsolvedConnectionsMap: Map<string, ConnectionPoint[]> = new Map()
    for (const { connectionName, x, y, z } of nodeWithPortPoints.portPoints) {
      unsolvedConnectionsMap.set(connectionName, [
        ...(unsolvedConnectionsMap.get(connectionName) ?? []),
        { x, y, z: z ?? 0 },
      ])
    }
    this.unsolvedConnections = Array.from(
      unsolvedConnectionsMap.entries().map(([connectionName, points]) => ({
        connectionName,
        points: dedupeConnectionPoints(points),
      })),
    )

    if (this.hyperParameters.SHUFFLE_SEED) {
      this.unsolvedConnections = cloneAndShuffleArray(
        this.unsolvedConnections,
        this.hyperParameters.SHUFFLE_SEED ?? 0,
      )

      // Shuffle the starting and ending points of each connection (some
      // algorithms are biased towards the start or end of a trace)
      this.unsolvedConnections = this.unsolvedConnections.map(
        ({ points, ...rest }, i) => ({
          ...rest,
          points: cloneAndShuffleArray(
            points,
            i * 7117 + (this.hyperParameters.SHUFFLE_SEED ?? 0),
          ),
        }),
      )
    }

    this.totalConnections = this.unsolvedConnections.length
    this.MAX_ITERATIONS = 1_000 * this.totalConnections ** 1.5

    this.minDistBetweenEnteringPoints = getMinDistBetweenEnteringPoints(
      this.nodeWithPortPoints,
    )
  }

  computeProgress() {
    return (
      (this.solvedRoutes.length + (this.activeSubSolver?.progress || 0)) /
      this.totalConnections
    )
  }

  /**
   * Returns the trace width to use for a given connection name.
   * Looks up the connectionTraceWidthMap first, then falls back to global traceWidth.
   */
  private getTraceWidthForConnection(connectionName: string): number {
    const override = this.connectionTraceWidthMap.get(connectionName)
    if (override !== undefined) return override
    return this.traceWidth
  }

  private getSingleRouteSolverOpts(unsolvedConnection: {
    connectionName: string
    points: { x: number; y: number; z: number }[]
  }) {
    const { connectionName, points } = unsolvedConnection
    const traceThickness = this.getTraceWidthForConnection(connectionName)
    return {
      connectionName,
      minDistBetweenEnteringPoints: this.minDistBetweenEnteringPoints,
      bounds: getBoundsFromNodeWithPortPoints(this.nodeWithPortPoints),
      A: { x: points[0].x, y: points[0].y, z: points[0].z },
      B: {
        x: points[points.length - 1].x,
        y: points[points.length - 1].y,
        z: points[points.length - 1].z,
      },
      obstacleRoutes: this.connMap
        ? this.solvedRoutes.filter(
            (sr) =>
              !this.connMap!.areIdsConnected(sr.connectionName, connectionName),
          )
        : this.solvedRoutes,
      futureConnections: this.unsolvedConnections,
      layerCount: this.nodeWithPortPoints.portPoints.reduce(
        (max, p) => Math.max(max, (p.z ?? 0) + 1),
        2,
      ),
      availableZ:
        this.nodeWithPortPoints.availableZ &&
        this.nodeWithPortPoints.availableZ.length > 0
          ? this.nodeWithPortPoints.availableZ
          : [
              ...new Set(
                this.nodeWithPortPoints.portPoints.map((point) => point.z ?? 0),
              ),
            ].sort((a, b) => a - b),
      hyperParameters: this.hyperParameters,
      connMap: this.connMap,
      viaDiameter: this.viaDiameter,
      traceThickness,
      obstacleMargin: this.obstacleMargin,
    }
  }

  private trySolveSamePointLayerChange(unsolvedConnection: {
    connectionName: string
    points: { x: number; y: number; z: number }[]
  }) {
    const opts = this.getSingleRouteSolverOpts(unsolvedConnection)
    const obstacleChecker =
      new SingleHighDensityRouteSolver6_VertHorzLayer_FutureCost(opts)
    const { A, B } = opts
    const viaPoint = { x: A.x, y: A.y }

    if (!isEndpointViaSafe(obstacleChecker, viaPoint, A, B)) {
      return false
    }

    const route = [
      { x: A.x, y: A.y, z: A.z },
      { ...viaPoint, z: A.z },
      { ...viaPoint, z: B.z },
      { x: B.x, y: B.y, z: B.z },
    ].filter(
      (pt, idx, arr) =>
        idx === 0 ||
        Math.abs(pt.x - arr[idx - 1].x) > 1e-6 ||
        Math.abs(pt.y - arr[idx - 1].y) > 1e-6 ||
        pt.z !== arr[idx - 1].z,
    )

    this.solvedRoutes.push({
      connectionName: unsolvedConnection.connectionName,
      traceThickness: this.getTraceWidthForConnection(
        unsolvedConnection.connectionName,
      ),
      viaDiameter: this.viaDiameter,
      route,
      vias: [{ x: viaPoint.x, y: viaPoint.y }],
    })
    return true
  }

  private queueExtraBranchesForMultiPointConnect(unsolvedConnection: {
    connectionName: string
    points: { x: number; y: number; z: number }[]
  }) {
    if (unsolvedConnection.points.length <= 2) return

    const remainingPoints = unsolvedConnection.points.slice(1)
    this.unsolvedConnections.unshift({
      connectionName: unsolvedConnection.connectionName,
      points: remainingPoints,
    })
  }

  _step() {
    if (this.activeSubSolver) {
      this.activeSubSolver.step()
      if (this.activeSubSolver.solved) {
        if (this.activeSubSolver.solvedPath) {
          this.solvedRoutes.push(this.activeSubSolver.solvedPath)
          this.queueExtraBranchesForMultiPointConnect(
            this.activeSubSolver.solvedPath as any,
          )
        }
        this.activeSubSolver = null
      } else if (this.activeSubSolver.failed) {
        this.failedSubSolvers.push(this.activeSubSolver)
        this.activeSubSolver = null
      }
      return
    }

    const unsolvedConnection = this.unsolvedConnections.shift()

    if (!unsolvedConnection) {
      this.solved = true
      return
    }

    if (unsolvedConnection.points.length < 2) {
      return
    }

    // Special case: same x,y but different z = simple via at endpoint
    if (
      unsolvedConnection.points.length === 2 &&
      Math.abs(
        unsolvedConnection.points[0].x - unsolvedConnection.points[1].x,
      ) < 0.001 &&
      Math.abs(
        unsolvedConnection.points[0].y - unsolvedConnection.points[1].y,
      ) < 0.001 &&
      unsolvedConnection.points[0].z !== unsolvedConnection.points[1].z
    ) {
      if (this.trySolveSamePointLayerChange(unsolvedConnection)) {
        return
      }
    }

    const opts = this.getSingleRouteSolverOpts(unsolvedConnection)
    this.activeSubSolver =
      new SingleHighDensityRouteSolver6_VertHorzLayer_FutureCost(opts)
  }

  visualize(): GraphicsObject {
    const graphics: GraphicsObject = {
      lines: [],
      points: [],
      circles: [],
      rects: [],
      title: "Intra Node Route Solver",
    }

    for (const route of this.solvedRoutes) {
      const color = this.colorMap[route.connectionName] ?? "green"
      for (let i = 0; i < route.route.length - 1; i++) {
        const p1 = route.route[i]
        const p2 = route.route[i + 1]
        graphics.lines!.push({
          points: [
            { x: p1.x, y: p1.y },
            { x: p2.x, y: p2.y },
          ],
          strokeColor: p1.z !== 0 ? safeTransparentize(color, 0.5) : color,
          strokeWidth: route.traceThickness,
        })
      }
    }

    if (this.activeSubSolver) {
      const subViz = this.activeSubSolver.visualize()
      if (subViz.lines) graphics.lines!.push(...subViz.lines)
      if (subViz.points) graphics.points!.push(...subViz.points)
      if (subViz.circles) graphics.circles!.push(...subViz.circles)
    }

    return graphics
  }
}

function isEndpointViaSafe(
  solver: SingleHighDensityRouteSolver6_VertHorzLayer_FutureCost,
  viaPoint: { x: number; y: number },
  A: { x: number; y: number; z: number },
  B: { x: number; y: number; z: number },
) {
  return !solver.isNodeTooCloseToObstacle(
    { ...viaPoint, z: A.z, g: 0, h: 0, f: 0, parent: null },
    undefined,
    true,
  )
}
