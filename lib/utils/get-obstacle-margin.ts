/**
 * Utility: compute the minimum margin (in mm) that a trace of a given
 * thickness must maintain away from a circular or rectangular obstacle.
 *
 * This value is added to the raw obstacle radius/half-extents to produce
 * the "inflated" obstacle that path-planning must avoid.
 */

import { STANDARD_TRACE_THICKNESS_MM } from "../types/trace-thickness"

/** IPC-2221 minimum electrical clearance for internal copper layers (mm). */
export const IPC_MIN_CLEARANCE_MM = 0.1

/**
 * Compute the required keep-out margin from the edge of an obstacle to the
 * centre-line of a trace.
 *
 * @param traceWidthMm  Width of the trace being routed (mm).  Default: 0.15.
 * @returns             Required margin in mm.
 */
export function getObstacleMargin(
  traceWidthMm: number = STANDARD_TRACE_THICKNESS_MM,
): number {
  return traceWidthMm / 2 + IPC_MIN_CLEARANCE_MM
}

/**
 * Inflate a pad / via radius by the required margin for the given trace width.
 *
 * @param padRadiusMm   The physical radius of the pad or via (mm).
 * @param traceWidthMm  Width of the trace being routed (mm).
 * @returns             Centre-line keep-out radius in mm.
 */
export function inflateObstacleRadius(
  padRadiusMm: number,
  traceWidthMm: number = STANDARD_TRACE_THICKNESS_MM,
): number {
  return padRadiusMm + getObstacleMargin(traceWidthMm)
}

/**
 * Inflate rectangular obstacle half-extents by the required margin.
 *
 * @param halfW         Half-width of the obstacle (mm).
 * @param halfH         Half-height of the obstacle (mm).
 * @param traceWidthMm  Width of the trace being routed (mm).
 * @returns             Inflated { halfW, halfH } in mm.
 */
export function inflateObstacleRect(
  halfW: number,
  halfH: number,
  traceWidthMm: number = STANDARD_TRACE_THICKNESS_MM,
): { halfW: number; halfH: number } {
  const margin = getObstacleMargin(traceWidthMm)
  return {
    halfW: halfW + margin,
    halfH: halfH + margin,
  }
}
