import { ConnectivityMap } from "circuit-json-to-connectivity-map"
import type { GraphicsObject } from "graphics-debug"
import { getGlobalInMemoryCache } from "lib/cache/setupGlobalCaches"
import type { CapacityMeshNodeId } from "lib/types/capacity-mesh-types"
import { SimpleRouteConnection } from "lib/types"
import { combineVisualizations } from "lib/utils/combineVisualizations"
import { mergeRouteSegments } from "lib/utils/mergeRouteSegments"
import type {
  HighDensityIntraNodeRoute,
  NodeWithPortPoints,
} from "../../types/high-density-types"
import { BaseSolver } from "../BaseSolver"
import { HyperSingleIntraNodeSolver } from "../HyperHighDensitySolver/HyperSingleIntraNodeSolver"
import { safeTransparentize } from "../colors"
import { CachedIntraNodeRouteSolver } from "./CachedIntraNodeRouteSolver"
import { IntraNodeRouteSolver } from "./IntraNodeSolver"

export class HighDensitySolver extends BaseSolver {
  override getSolverName(): string {
    return "HighDensitySolver"
  }

  unsolvedNodePortPoints: NodeWithPortPoints[]
  routes: HighDensityIntraNodeRoute[]
  colorMap: Record<string, string>

  // Defaults as specified: viaDiameter of 0.3 and traceThickness of 0.15
  readonly defaultViaDiameter = 0.3
  readonly defaultTraceThickness = 0.15
  viaDiameter: number
  traceWidth: number
  obstacleMargin: number
  effort: number

  /**
   * Per-connection trace width overrides, keyed by connection name or root
   * connection name. Built from the connections' nominalTraceWidth field.
   */
  connectionTraceWidthMap: Map<string, number>

  failedSolvers: (IntraNodeRouteSolver | HyperSingleIntraNodeSolver)[]
  activeSubSolver: IntraNodeRouteSolver | HyperSingleIntraNodeSolver | null =
    null
  connMap?: ConnectivityMap
  nodePfById: Map<CapacityMeshNodeId, number | null>
  nodeSolveMetadataById: Map<
    CapacityMeshNodeId,
    {
      node: NodeWithPortPoints
      status: "solved" | "failed"
      solverType: string
      iterations: number
      routeCount: number
      nodePf: number | null
      error?: string
    }
  >

  constructor({
    nodePortPoints,
    colorMap,
    connMap,
    viaDiameter,
    traceWidth,
    obstacleMargin,
    effort,
    nodePfById,
    connections,
  }: {
    nodePortPoints: NodeWithPortPoints[]
    colorMap?: Record<string, string>
    connMap?: ConnectivityMap
    viaDiameter?: number
    traceWidth?: number
    obstacleMargin?: number
    effort?: number
    nodePfById?:
      | Map<CapacityMeshNodeId, number | null>
      | Record<string, number | null>
    connections?: SimpleRouteConnection[]
  }) {
    super()
    this.unsolvedNodePortPoints = nodePortPoints
    this.colorMap = colorMap ?? {}
    this.connMap = connMap
    this.routes = []
    this.failedSolvers = []
    this.effort = effort ?? 1
    this.MAX_ITERATIONS = 10e6 * this.effort
    this.viaDiameter = viaDiameter ?? this.defaultViaDiameter
    this.traceWidth = traceWidth ?? this.defaultTraceThickness
    this.obstacleMargin = obstacleMargin ?? 0.15
    this.nodePfById =
      nodePfById instanceof Map
        ? new Map(nodePfById)
        : new Map(Object.entries(nodePfById ?? {}))
    this.nodeSolveMetadataById = new Map()
    this.stats = {
      solverNodeCount: {} as Record<string, number>,
      difficultNodePfs: {} as Record<string, number[]>,
    }

    // Build per-connection trace width map from connections' nominalTraceWidth
    this.connectionTraceWidthMap = new Map()
    if (connections) {
      for (const connection of connections) {
        if (connection.nominalTraceWidth !== undefined) {
          this.connectionTraceWidthMap.set(
            connection.name,
            connection.nominalTraceWidth,
          )
          // Also index by rootConnectionName so MST sub-connections resolve
          if (connection.rootConnectionName) {
            if (
              !this.connectionTraceWidthMap.has(connection.rootConnectionName)
            ) {
              this.connectionTraceWidthMap.set(
                connection.rootConnectionName,
                connection.nominalTraceWidth,
              )
            }
          }
        }
      }
    }
  }

  private getSolvedNodeSolverType(
    solver: IntraNodeRouteSolver | HyperSingleIntraNodeSolver,
  ): string {
    if (solver instanceof HyperSingleIntraNodeSolver && solver.winningSolver) {
      return this.getConcreteSolverTypeName(solver.winningSolver as BaseSolver)
    }
    return this.getConcreteSolverTypeName(solver)
  }

  private recordNodeSolveMetadata(
    solver: IntraNodeRouteSolver | HyperSingleIntraNodeSolver,
    status: "solved" | "failed",
  ) {
    const node = solver.nodeWithPortPoints
    const nodePf = this.nodePfById.get(node.capacityMeshNodeId) ?? null
    this.nodeSolveMetadataById.set(node.capacityMeshNodeId, {
      node,
      status,
      solverType: this.getSolvedNodeSolverType(solver),
      iterations: solver.iterations,
      routeCount: solver.solvedRoutes.length,
      nodePf,
      error: solver.error ?? undefined,
    })
  }

  private createNodeMarkerLabel(
    capacityMeshNodeId: CapacityMeshNodeId,
    metadata: {
      status: "solved" | "failed"
      solverType: string
      iterations: number
      routeCount: number
      nodePf: number | null
      node: NodeWithPortPoints
      error?: string
    },
  ): string {
    const connectionNames = Array.from(
      new Set(metadata.node.portPoints.map((p) => p.connectionName)),
    )
    return [
      `hd_node_marker`,
      `node: ${capacityMeshNodeId}`,
      `status: ${metadata.status}`,
      `solver: ${metadata.solverType}`,
      `iterations: ${metadata.iterations}`,
      `routes: ${metadata.routeCount}`,
      `nodePf: ${metadata.nodePf ?? "n/a"}`,
      `portPoints: ${metadata.node.portPoints.length}`,
      `connections: ${connectionNames.join(", ")}`,
      ...(metadata.error ? [`error: ${metadata.error}`] : []),
    ].join("\n")
  }

  private getConcreteSolverTypeName(solver: BaseSolver): string {
    if (solver instanceof CachedIntraNodeRouteSolver) {
      const concreteName = this.getIntraNodeStrategyName(solver.hyperParameters)
      return solver.cacheHit ? `${concreteName} [cached]` : concreteName
    }

    if (solver instanceof IntraNodeRouteSolver) {
      return this.getIntraNodeStrategyName(solver.hyperParameters)
    }

    return solver.getSolverName()
  }

  private getIntraNodeStrategyName(
    hyperParameters: Record<string, any> | undefined,
  ): string {
    if (hyperParameters?.MULTI_HEAD_POLYLINE_SOLVER) {
      return "MultiHeadPolyLineIntraNodeSolver3"
    }
    if (hyperParameters?.SINGLE_LAYER_NO_DIFFERENT_ROOT_INTERSECTIONS) {
      return "SingleLayerNoDifferentRootIntersectionsIntraNodeSolver"
    }
    if (hyperParameters?.CLOSED_FORM_SINGLE_TRANSITION) {
      return "SingleTransitionIntraNodeSolver"
    }
    if (hyperParameters?.CLOSED_FORM_TWO_TRACE_SAME_LAYER) {
      return "TwoCrossingRoutesHighDensitySolver"
    }
    if (hyperParameters?.CLOSED_FORM_TWO_TRACE_TRANSITION_CROSSING) {
      return "SingleTransitionCrossingRouteSolver"
    }
    if (hyperParameters?.FIXED_TOPOLOGY_HIGH_DENSITY_INTRA_NODE_SOLVER) {
      return "FixedTopologyHighDensityIntraNodeSolver"
    }
    if (hyperParameters?.HIGH_DENSITY_A01) {
      return "HighDensitySolverA01"
    }
    if (hyperParameters?.HIGH_DENSITY_A03) {
      return "HighDensitySolverA03"
    }
    return "SingleHighDensityRouteSolver6_VertHorzLayer_FutureCost"
  }

  private recordSolvedNodeStats(
    solver: IntraNodeRouteSolver | HyperSingleIntraNodeSolver,
    node: NodeWithPortPoints,
  ) {
    const solverType = this.getSolvedNodeSolverType(solver)
    const solverNodeCount = this.stats.solverNodeCount as Record<string, number>
    const difficultNodePfs = this.stats.difficultNodePfs as Record<
      string,
      number[]
    >

    solverNodeCount[solverType] = (solverNodeCount[solverType] ?? 0) + 1

    const pf = this.nodePfById.get(node.capacityMeshNodeId) ?? null
    if (pf !== null && pf > 0.05) {
      if (!difficultNodePfs[solverType]) {
        difficultNodePfs[solverType] = []
      }
      difficultNodePfs[solverType].push(pf)
    }
  }

  /**
   * Each iteration, pop an unsolved node and attempt to find the routes inside
   * of it.
   */
  _step() {
    this.updateCacheStats()
    if (this.activeSubSolver) {
      this.activeSubSolver.step()
      if (this.activeSubSolver.solved) {
        this.routes.push(...this.activeSubSolver.solvedRoutes)
        this.recordNodeSolveMetadata(this.activeSubSolver, "solved")
        this.recordSolvedNodeStats(
          this.activeSubSolver,
          this.activeSubSolver.nodeWithPortPoints,
        )
        this.activeSubSolver = null
      } else if (this.activeSubSolver.failed) {
        this.recordNodeSolveMetadata(this.activeSubSolver, "failed")
        this.failedSolvers.push(this.activeSubSolver)
        this.activeSubSolver = null
      }
      this.updateCacheStats()
      return
    }
    if (this.unsolvedNodePortPoints.length === 0) {
      if (this.failedSolvers.length > 0) {
        this.solved = false
        this.failed = true
        this.error = `${this.failedSolvers.length} nodes failed to route`
      } else {
        this.solved = true
      }
      return
    }

    const nodePortPoints = this.unsolvedNodePortPoints.shift()!

    const cache = getGlobalInMemoryCache()

    if (cache) {
      this.activeSubSolver = new CachedIntraNodeRouteSolver({
        nodeWithPortPoints: nodePortPoints,
        colorMap: this.colorMap,
        connMap: this.connMap,
        viaDiameter: this.viaDiameter,
        traceWidth: this.traceWidth,
        obstacleMargin: this.obstacleMargin,
        connectionTraceWidthMap: this.connectionTraceWidthMap,
      })
    } else {
      this.activeSubSolver = new IntraNodeRouteSolver({
        nodeWithPortPoints: nodePortPoints,
        colorMap: this.colorMap,
        connMap: this.connMap,
        viaDiameter: this.viaDiameter,
        traceWidth: this.traceWidth,
        obstacleMargin: this.obstacleMargin,
        connectionTraceWidthMap: this.connectionTraceWidthMap,
      })
    }
  }

  updateCacheStats() {
    if (this.activeSubSolver instanceof CachedIntraNodeRouteSolver) {
      const stats = this.stats as any
      stats.cacheHits = (stats.cacheHits ?? 0) + (this.activeSubSolver.cacheHit ? 1 : 0)
    }
  }

  visualize(): GraphicsObject {
    const graphics: GraphicsObject = {
      points: [],
      lines: [],
      circles: [],
      rects: [],
      title: "High Density Solver",
    }

    for (const route of this.routes) {
      const color = this.colorMap[route.connectionName] ?? "green"
      for (let i = 0; i < route.route.length - 1; i++) {
        const p1 = route.route[i]
        const p2 = route.route[i + 1]
        graphics.lines!.push({
          points: [
            { x: p1.x, y: p1.y },
            { x: p2.x, y: p2.y },
          ],
          strokeColor:
            p1.z !== 0 ? safeTransparentize(color, 0.5) : color,
          strokeWidth: route.traceThickness,
        })
      }
      for (const via of route.vias ?? []) {
        graphics.circles!.push({
          x: via.x,
          y: via.y,
          radius: this.viaDiameter / 2,
          fill: color,
        })
      }
    }

    // Show node solve metadata as labels
    for (const [
      capacityMeshNodeId,
      metadata,
    ] of this.nodeSolveMetadataById.entries()) {
      const label = this.createNodeMarkerLabel(capacityMeshNodeId, metadata)
      const color = metadata.status === "solved" ? "green" : "red"
      graphics.points!.push({
        x: metadata.node.center.x,
        y: metadata.node.center.y,
        color,
        label,
      })
    }

    if (this.activeSubSolver) {
      return combineVisualizations(graphics, this.activeSubSolver.visualize())
    }

    return graphics
  }
}
