/**
 * Trace thickness types and utilities for the autorouter.
 *
 * The industry-standard data line thickness is 0.15mm.
 * We support 1x, 2x, 4x and 8x multiples for power routing:
 *   - 0.15mm (1x) — standard signal trace
 *   - 0.30mm (2x) — light power trace
 *   - 0.60mm (4x) — medium power trace
 *   - 1.20mm (8x) — heavy power / bus trace
 */

export const STANDARD_TRACE_THICKNESS_MM = 0.15

export type TraceThicknessMultiple = 1 | 2 | 4 | 8

export const TRACE_THICKNESS_MULTIPLES: TraceThicknessMultiple[] = [1, 2, 4, 8]

export const TRACE_THICKNESS_MM: Record<TraceThicknessMultiple, number> = {
  1: 0.15,
  2: 0.30,
  4: 0.60,
  8: 1.20,
}

/**
 * Given a thickness in mm, return the closest supported multiple.
 * Rounds to the nearest supported multiple (1x, 2x, 4x, 8x).
 */
export function getTraceThicknessMultiple(
  thicknessMm: number,
): TraceThicknessMultiple {
  const ratio = thicknessMm / STANDARD_TRACE_THICKNESS_MM
  if (ratio <= 1.5) return 1
  if (ratio <= 3) return 2
  if (ratio <= 6) return 4
  return 8
}

/**
 * Convert a thickness multiple to mm.
 */
export function traceThicknessMultipleToMm(
  multiple: TraceThicknessMultiple,
): number {
  return TRACE_THICKNESS_MM[multiple]
}

/**
 * Return the half-width (radius) of a trace in mm.
 * Used for clearance / obstacle inflation calculations.
 */
export function traceHalfWidth(thicknessMm: number): number {
  return thicknessMm / 2
}

/**
 * Compute the minimum clearance needed between two traces of given thicknesses.
 * IPC-2221 minimum clearance for internal layers is 0.1mm; we use that as floor.
 */
export function minClearanceBetweenTraces(
  aThicknessMm: number,
  bThicknessMm: number,
): number {
  const IPC_MIN_CLEARANCE_MM = 0.1
  return aThicknessMm / 2 + bThicknessMm / 2 + IPC_MIN_CLEARANCE_MM
}

/**
 * Compute the effective obstacle inflation radius for a trace of given thickness
 * routing next to an obstacle (pad, via, other trace).
 * The obstacle itself has radius `obstacleRadiusMm`.
 */
export function obstacleInflationRadius(
  traceThicknessMm: number,
  obstacleRadiusMm: number,
): number {
  const IPC_MIN_CLEARANCE_MM = 0.1
  return traceThicknessMm / 2 + obstacleRadiusMm + IPC_MIN_CLEARANCE_MM
}
