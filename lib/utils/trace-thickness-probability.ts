/**
 * Probability adjustments for trace thickness.
 *
 * Thicker traces are harder to route through high-density areas.
 * We model this as a multiplicative penalty on the base routing probability
 * so that the solver naturally prefers thinner connections through tight spots
 * and reserves space for thick traces.
 *
 * The penalty is derived from the ratio of the inflated cell-width that a thick
 * trace consumes relative to the standard trace width.
 */

import { STANDARD_TRACE_THICKNESS_MM } from "../types/trace-thickness"
import { getObstacleMargin } from "./get-obstacle-margin"

/**
 * Effective "lane width" consumed by a trace of a given thickness.
 *
 * A standard 0.15 mm trace in a 0.5 mm pitch grid uses:
 *   trace half-width (0.075) + clearance (0.1) = 0.175 mm on each side
 * so it occupies 0.35 mm of the 0.5 mm lane.
 *
 * A 4× trace (0.6 mm) uses:
 *   trace half-width (0.3)  + clearance (0.1) = 0.4 mm on each side
 * so it occupies 0.8 mm — i.e. spans ≈ 2.3× more lanes.
 *
 * @param traceWidthMm  Trace width in mm.
 * @returns             Effective lane width in mm.
 */
export function effectiveLaneWidth(traceWidthMm: number): number {
  return traceWidthMm + 2 * getObstacleMargin(traceWidthMm)
}

/**
 * Routing-difficulty multiplier relative to the standard trace.
 *
 * Values > 1 mean the trace is harder to route than standard.
 * Used to scale probabilities or cost estimates in the solver.
 *
 * @param traceWidthMm  Trace width in mm.
 * @returns             Difficulty ratio (≥ 1.0).
 */
export function traceThicknessDifficultyRatio(traceWidthMm: number): number {
  const standardLane = effectiveLaneWidth(STANDARD_TRACE_THICKNESS_MM)
  const thisLane = effectiveLaneWidth(traceWidthMm)
  return Math.max(1, thisLane / standardLane)
}

/**
 * Probability penalty factor for routing a trace of given thickness through a
 * section that has `availableWidthMm` of free space.
 *
 * Returns a value in [0, 1]:
 *   - 1.0  → trace fits easily (≥ 2× lane width available)
 *   - 0.5  → trace barely fits (exactly 1× lane width available)
 *   - 0.0  → trace cannot fit (available < lane width)
 *
 * @param traceWidthMm      Trace width in mm.
 * @param availableWidthMm  Available corridor width in mm.
 */
export function traceThicknessProbabilityFactor(
  traceWidthMm: number,
  availableWidthMm: number,
): number {
  const lane = effectiveLaneWidth(traceWidthMm)
  if (availableWidthMm < lane) return 0
  // Linear scale: at exactly lane width → 0.5, at 2× lane width → 1.0
  return Math.min(1, 0.5 + (availableWidthMm - lane) / (2 * lane))
}

/**
 * Adjust a raw obstacle-passage probability for the thickness of the trace
 * being routed through it.
 *
 * @param baseProbability   Raw passage probability for a standard trace.
 * @param traceWidthMm      Width of the trace being routed.
 * @param corridorWidthMm   Estimated corridor width at the passage.
 * @returns                 Adjusted probability in [0, 1].
 */
export function adjustProbabilityForThickness(
  baseProbability: number,
  traceWidthMm: number,
  corridorWidthMm: number,
): number {
  if (traceWidthMm <= STANDARD_TRACE_THICKNESS_MM) {
    // No penalty for standard thickness
    return baseProbability
  }
  const factor = traceThicknessProbabilityFactor(traceWidthMm, corridorWidthMm)
  // Combine: thick traces reduce the base probability by the factor
  return baseProbability * factor
}
