import { describe, it, expect } from "vitest"
import {
  STANDARD_TRACE_THICKNESS_MM,
  TRACE_THICKNESS_MM,
  getTraceThicknessMultiple,
  traceThicknessMultipleToMm,
  traceHalfWidth,
  minClearanceBetweenTraces,
  obstacleInflationRadius,
} from "../../lib/types/trace-thickness"

describe("trace-thickness types", () => {
  it("has correct standard thickness", () => {
    expect(STANDARD_TRACE_THICKNESS_MM).toBe(0.15)
  })

  it("has correct thickness values for each multiple", () => {
    expect(TRACE_THICKNESS_MM[1]).toBe(0.15)
    expect(TRACE_THICKNESS_MM[2]).toBe(0.30)
    expect(TRACE_THICKNESS_MM[4]).toBe(0.60)
    expect(TRACE_THICKNESS_MM[8]).toBe(1.20)
  })

  it("getTraceThicknessMultiple rounds correctly", () => {
    expect(getTraceThicknessMultiple(0.15)).toBe(1)
    expect(getTraceThicknessMultiple(0.20)).toBe(1) // below 1.5x threshold
    expect(getTraceThicknessMultiple(0.25)).toBe(2) // above 1.5x threshold
    expect(getTraceThicknessMultiple(0.30)).toBe(2)
    expect(getTraceThicknessMultiple(0.50)).toBe(4) // above 3x threshold
    expect(getTraceThicknessMultiple(0.60)).toBe(4)
    expect(getTraceThicknessMultiple(1.00)).toBe(8)
    expect(getTraceThicknessMultiple(1.20)).toBe(8)
  })

  it("traceThicknessMultipleToMm converts correctly", () => {
    expect(traceThicknessMultipleToMm(1)).toBe(0.15)
    expect(traceThicknessMultipleToMm(2)).toBe(0.30)
    expect(traceThicknessMultipleToMm(4)).toBe(0.60)
    expect(traceThicknessMultipleToMm(8)).toBe(1.20)
  })

  it("traceHalfWidth returns half of thickness", () => {
    expect(traceHalfWidth(0.15)).toBeCloseTo(0.075)
    expect(traceHalfWidth(0.30)).toBeCloseTo(0.15)
    expect(traceHalfWidth(0.60)).toBeCloseTo(0.30)
  })

  it("minClearanceBetweenTraces includes both half-widths and IPC clearance", () => {
    // two standard traces: 0.075 + 0.075 + 0.1 = 0.25
    expect(minClearanceBetweenTraces(0.15, 0.15)).toBeCloseTo(0.25)
    // standard + 2x: 0.075 + 0.15 + 0.1 = 0.325
    expect(minClearanceBetweenTraces(0.15, 0.30)).toBeCloseTo(0.325)
  })

  it("obstacleInflationRadius includes pad radius, trace half-width, and clearance", () => {
    // padRadius=0.2, trace=0.15 → 0.2 + 0.075 + 0.1 = 0.375
    expect(obstacleInflationRadius(0.2, 0.15)).toBeCloseTo(0.375)
    // padRadius=0.2, trace=0.30 → 0.2 + 0.15 + 0.1 = 0.45
    expect(obstacleInflationRadius(0.2, 0.30)).toBeCloseTo(0.45)
  })
})
