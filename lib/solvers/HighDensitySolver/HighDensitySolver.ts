import { ConnectivityMap } from "circuit-json-to-connectivity-map"
import type { GraphicsObject } from "graphics-debug"
import { getGlobalInMemoryCache } from "lib/cache/setupGlobalCaches"
import type { CapacityMeshNodeId } from "lib/types/capacity-mesh-types"
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
   * Per-connection nominal trace widths. When a connection name is found here,
   * its value is used as the traceWidth for that connection's intra-node
   * routing. The rootConnectionName is also checked as a fallback.
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
    connectionTraceWidthMap,
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
    /**
     * Optional map from connection name to nominal trace width. Used to route
     * power traces etc. at a wider width than the default minTraceWidth.
     */
    connectionTraceWidthMap?:
      | Map<string, number>
      | Record<string, number>
      | null
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

    if (connectionTraceWidthMap instanceof Map) {
      this.connectionTraceWidthMap = new Map(connectionTraceWidthMap)
    } else if (connectionTraceWidthMap) {
      this.connectionTraceWidthMap = new Map(
        Object.entries(connectionTraceWidthMap),
      )
    } else {
      this.connectionTraceWidthMap = new Map()
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
   * Compute the effective trace width for a given node. If all port points in
   * the node belong to the same connection that has a nominalTraceWidth, use
   * that. Otherwise fall back to the global traceWidth.
   *
   * For nodes with mixed connections we use the maximum requested width so that
   * the wider trace gets the space it needs (the TraceWidthSolver will narrow
   * traces that don't fit later).
   */
  private getTraceWidthForNode(node: NodeWithPortPoints): number {
    if (this.connectionTraceWidthMap.size === 0) {
      return this.traceWidth
    }

    let maxWidth = this.traceWidth
    const seen = new Set<string>()

    for (const portPoint of node.portPoints) {
      const key = portPoint.rootConnectionName ?? portPoint.connectionName
      if (seen.has(key)) continue
      seen.add(key)

      const byName = this.connectionTraceWidthMap.get(portPoint.connectionName)
      const byRoot = portPoint.rootConnectionName
        ? this.connectionTraceWidthMap.get(portPoint.rootConnectionName)
        : undefined

      const w = byName ?? byRoot
      if (w !== undefined && w > maxWidth) {
        maxWidth = w
      }
    }

    return maxWidth
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
      } else {
        this.solved = true
      }
      return
    }

    const node = this.unsolvedNodePortPoints.shift()!
    const nodeTraceWidth = this.getTraceWidthForNode(node)
    const nodePf = this.nodePfById.get(node.capacityMeshNodeId) ?? null

    const cache = getGlobalInMemoryCache()

    this.activeSubSolver = new CachedIntraNodeRouteSolver({
      nodeWithPortPoints: node,
      colorMap: this.colorMap,
      connMap: this.connMap,
      viaDiameter: this.viaDiameter,
      traceWidth: nodeTraceWidth,
      obstacleMargin: this.obstacleMargin,
      effort: this.effort,
      nodePf: nodePf ?? undefined,
      cache,
      connectionTraceWidthMap: this.connectionTraceWidthMap,
    })
  }

  override visualize(): GraphicsObject {
    const visualizations: GraphicsObject[] = []

    for (const [capacityMeshNodeId, metadata] of this.nodeSolveMetadataById) {
      const node = metadata.node
      const color =
        metadata.status === "solved"
          ? safeTransparentize("green", 0.9)
          : safeTransparentize("red", 0.9)

      visualizations.push({
        rects: [
          {
            center: node.center,
            width: node.width,
            height: node.height,
            color,
            label: this.createNodeMarkerLabel(capacityMeshNodeId, metadata),
          },
        ],
      })
    }

    const routeVisualization = combineVisualizations(
      ...(this.routes.map((r) => mergeRouteSegments([r])) ?? []),
    )

    return combineVisualizations(routeVisualization, ...visualizations)
  }
}
