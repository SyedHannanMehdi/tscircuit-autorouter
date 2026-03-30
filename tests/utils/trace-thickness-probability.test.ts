import { describe, it, expect } from "vitest"
import {
  effectiveLaneWidth,
  traceThicknessDifficultyRatio,
  traceThicknessProbabilityFactor,
  adjustProbabilityForThickness,
} from "../../lib/utils/trace-thickness-probability"
import { STANDARD_TRACE_THICKNESS_MM } from "../../lib/types/trace-thickness"

describe("trace-thickness-probability", () => {
  it("effectiveLaneWidth for standard trace is trace width + 2 * margin", () => {
    // 0.15 + 2 * (0.075 + 0.1) = 0.15 + 0.35 = 0.50
    expect(effectiveLaneWidth(STANDARD_TRACE_THICKNESS_MM)).toBeCloseTo(0.50)
  })

  it("effectiveLaneWidth grows with thickness", () => {
    // 0.30 + 2 * (0.15 + 0.1) = 0.30 + 0.50 = 0.80
    expect(effectiveLaneWidth(0.30)).toBeCloseTo(0.80)
    // 0.60 + 2 * (0.30 + 0.1) = 0.60 + 0.80 = 1.40
    expect(effectiveLaneWidth(0.60)).toBeCloseTo(1.40)
  })

  it("difficulty ratio is 1.0 for standard trace", () => {
    expect(traceThicknessDifficultyRatio(STANDARD_TRACE_THICKNESS_MM)).toBeCloseTo(1.0)
  })

  it("difficulty ratio > 1 for thicker traces", () => {
    expect(traceThicknessDifficultyRatio(0.30)).toBeGreaterThan(1.0)
    expect(traceThicknessDifficultyRatio(0.60)).toBeGreaterThan(1.5)
    expect(traceThicknessDifficultyRatio(1.20)).toBeGreaterThan(2.5)
  })

  it("traceThicknessProbabilityFactor returns 0 when trace doesn't fit", () => {
    // standard lane = 0.5 mm; if corridor is 0.3 mm, can't fit
    expect(traceThicknessProbabilityFactor(0.15, 0.3)).toBe(0)
  })

  it("traceThicknessProbabilityFactor returns ~0.5 when exactly fitting", () => {
    const lane = effectiveLaneWidth(0.15) // ~0.5
    expect(traceThicknessProbabilityFactor(0.15, lane)).toBeCloseTo(0.5)
  })

  it("traceThicknessProbabilityFactor returns 1.0 when corridor is 2× lane", () => {
    const lane = effectiveLaneWidth(0.15)
    expect(traceThicknessProbabilityFactor(0.15, lane * 2)).toBeCloseTo(1.0)
  })

  it("traceThicknessProbabilityFactor clamps to [0, 1]", () => {
    expect(traceThicknessProbabilityFactor(0.15, 10)).toBe(1)
    expect(traceThicknessProbabilityFactor(0.15, 0)).toBe(0)
  })

  it("adjustProbabilityForThickness does not change probability for standard trace", () => {
    expect(adjustProbabilityForThickness(0.8, 0.15, 2.0)).toBeCloseTo(0.8)
  })

  it("adjustProbabilityForThickness reduces probability for thick trace", () => {
    const base = 0.9
    const adjusted = adjustProbabilityForThickness(base, 0.60, 1.0)
    expect(adjusted).toBeLessThan(base)
  })

  it("adjustProbabilityForThickness returns 0 when thick trace cannot fit", () => {
    // 4x trace lane ~1.4mm; corridor 0.5mm → factor=0 → probability=0
    expect(adjustProbabilityForThickness(0.95, 0.60, 0.5)).toBe(0)
  })
})
