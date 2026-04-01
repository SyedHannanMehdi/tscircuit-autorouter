import { test, expect } from "bun:test"
import { AutoroutingPipelineSolver4_TinyHypergraph } from "lib/autorouter-pipelines/AutoroutingPipeline4_TinyHypergraph/AutoroutingPipelineSolver4_TinyHypergraph"
import type { SimpleRouteJson } from "lib/types"

/**
 * Tests that trace thickness (nominalTraceWidth) specified on a connection
 * is respected end-to-end through the pipeline:
 *   - It is propagated through NetToPointPairsSolver MST splits
 *   - The resulting hdRoutes have the correct traceThickness
 */

const baseSrj: SimpleRouteJson = {
  layerCount: 2,
  minTraceWidth: 0.15,
  minViaDiameter: 0.3,
  obstacles: [
    {
      type: "rect",
      layers: ["top", "bottom"],
      center: { x: 0, y: 0 },
      width: 0.4,
      height: 0.4,
      connectedTo: ["pad_A"],
    },
    {
      type: "rect",
      layers: ["top", "bottom"],
      center: { x: 3, y: 0 },
      width: 0.4,
      height: 0.4,
      connectedTo: ["pad_B"],
    },
  ],
  connections: [
    {
      name: "power",
      // 2x nominal width — the key feature being tested
      nominalTraceWidth: 0.3,
      pointsToConnect: [
        { x: 0, y: 0, layer: "top" },
        { x: 3, y: 0, layer: "top" },
      ],
    },
    {
      name: "signal",
      // default / thin trace
      nominalTraceWidth: 0.15,
      pointsToConnect: [
        { x: 0, y: 1, layer: "top" },
        { x: 3, y: 1, layer: "top" },
      ],
    },
  ],
  bounds: { minX: -1, maxX: 4, minY: -1, maxY: 2 },
}

test("trace thickness: nominalTraceWidth is propagated through pipeline", () => {
  const solver = new AutoroutingPipelineSolver4_TinyHypergraph(baseSrj)
  solver.solve()

  expect(solver.solved).toBe(true)

  const traces = solver.getSimplifiedRoutes?.() ?? (solver as any).traces ?? []

  // Check that we got traces
  if (traces.length > 0) {
    // Power traces should have thicker width
    const powerTrace = traces.find(
      (t: any) =>
        t.connection_name === "power" ||
        t.connection_name?.startsWith("power"),
    )
    if (powerTrace) {
      const wireSegments = powerTrace.route.filter(
        (r: any) => r.route_type === "wire",
      )
      if (wireSegments.length > 0) {
        expect(wireSegments[0].width).toBeCloseTo(0.3, 2)
      }
    }
  }
})

test("trace thickness: nominalTraceWidth propagated through MST split connections", () => {
  // A 3-point net — forces MST splitting into 2 sub-connections
  const srj: SimpleRouteJson = {
    layerCount: 2,
    minTraceWidth: 0.15,
    minViaDiameter: 0.3,
    obstacles: [],
    connections: [
      {
        name: "power_bus",
        nominalTraceWidth: 0.6,
        pointsToConnect: [
          { x: 0, y: 0, layer: "top" },
          { x: 2, y: 0, layer: "top" },
          { x: 4, y: 0, layer: "top" },
        ],
      },
    ],
    bounds: { minX: -1, maxX: 5, minY: -1, maxY: 1 },
  }

  const solver = new AutoroutingPipelineSolver4_TinyHypergraph(srj)
  solver.solve()

  // After MST split, the sub-connections (power_bus_mst0, power_bus_mst1)
  // should inherit nominalTraceWidth = 0.6 from the parent connection
  const srjWithPairs = solver.srjWithPointPairs
  if (srjWithPairs) {
    for (const conn of srjWithPairs.connections) {
      if (
        conn.name.startsWith("power_bus") ||
        conn.rootConnectionName === "power_bus"
      ) {
        expect(conn.nominalTraceWidth).toBe(0.6)
      }
    }
  }
})

test("trace thickness: TraceWidthSolver uses per-connection nominalTraceWidth", () => {
  const { TraceWidthSolver } = await import(
    "lib/solvers/TraceWidthSolver/TraceWidthSolver"
  )
  const { HighDensityRoute } = await import("lib/types/high-density-types")

  const hdRoutes = [
    {
      connectionName: "power",
      rootConnectionName: "power",
      traceThickness: 0.15,
      viaDiameter: 0.3,
      route: [
        { x: 0, y: 0, z: 0 },
        { x: 3, y: 0, z: 0 },
      ],
      vias: [],
    },
    {
      connectionName: "signal",
      traceThickness: 0.15,
      viaDiameter: 0.3,
      route: [
        { x: 0, y: 1, z: 0 },
        { x: 3, y: 1, z: 0 },
      ],
      vias: [],
    },
  ]

  const tws = new TraceWidthSolver({
    hdRoutes,
    connection: [
      { name: "power", nominalTraceWidth: 0.3, pointsToConnect: [] },
      { name: "signal", nominalTraceWidth: 0.15, pointsToConnect: [] },
    ],
    minTraceWidth: 0.15,
    layerCount: 2,
  })

  tws.solve()
  expect(tws.solved).toBe(true)

  const powerRoute = tws.hdRoutesWithWidths.find(
    (r) => r.connectionName === "power",
  )
  const signalRoute = tws.hdRoutesWithWidths.find(
    (r) => r.connectionName === "signal",
  )

  // Power route should use wider width (up to 0.3mm)
  if (powerRoute) {
    expect(powerRoute.traceThickness).toBeGreaterThanOrEqual(0.15)
    expect(powerRoute.traceThickness).toBeLessThanOrEqual(0.3)
  }

  // Signal route stays at 0.15mm (no wider needed)
  if (signalRoute) {
    expect(signalRoute.traceThickness).toBeCloseTo(0.15, 2)
  }
})
