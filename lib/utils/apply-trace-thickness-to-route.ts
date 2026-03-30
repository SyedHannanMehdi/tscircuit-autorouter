/**
 * Post-processing helper: stamp the correct `width` onto every segment of a
 * completed route.
 *
 * The autorouter returns PCB route segments (wire / via objects).  tscircuit
 * expects each wire segment to carry a `width` property (in mm) that reflects
 * the intended trace thickness.  This helper mutates / maps the route array to
 * ensure the width is always present and correct.
 */

import { STANDARD_TRACE_THICKNESS_MM } from "../types/trace-thickness"

/** Minimal shape of a routed wire segment as produced by the autorouter. */
export interface RouteSegment {
  route_type?: string
  type?: string
  width?: number
  [key: string]: unknown
}

/**
 * Ensure every wire segment in `route` has the correct `width` set.
 *
 * @param route         Array of route segments returned by the solver.
 * @param traceWidthMm  Desired trace width in mm.  Defaults to 0.15.
 * @returns             New array with `width` stamped on wire segments.
 */
export function applyTraceThicknessToRoute(
  route: RouteSegment[],
  traceWidthMm: number = STANDARD_TRACE_THICKNESS_MM,
): RouteSegment[] {
  return route.map((seg) => {
    const isWire =
      seg.route_type === "wire" ||
      seg.type === "wire" ||
      (seg.route_type == null && seg.type == null)
    if (!isWire) return seg
    // Only override width when the segment doesn't already carry a non-default
    // value, or when the caller explicitly provides a non-standard thickness.
    const existingWidth = typeof seg.width === "number" ? seg.width : STANDARD_TRACE_THICKNESS_MM
    const newWidth =
      traceWidthMm !== STANDARD_TRACE_THICKNESS_MM
        ? traceWidthMm
        : existingWidth
    return { ...seg, width: newWidth }
  })
}
