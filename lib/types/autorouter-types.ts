/**
 * Core type augmentations for trace-thickness support.
 *
 * These extend the SimpleRouteJson / input-soup types that the autorouter
 * already consumes.  The `traceWidth` field maps directly to the
 * circuit-json `route_thickness_mode` + `pcb_trace.route_thickness_mode`
 * fields used by tscircuit.
 */

import type { TraceThicknessMultiple } from "./trace-thickness"
import { STANDARD_TRACE_THICKNESS_MM, TRACE_THICKNESS_MM } from "./trace-thickness"

// ---------------------------------------------------------------------------
// Connection-level thickness annotation
// ---------------------------------------------------------------------------

/**
 * A connection (net segment between two pads/vias) may carry an optional
 * `traceWidth` in mm.  When absent the default 0.15 mm is used.
 */
export interface ConnectionWithThickness {
  /** Optional explicit trace width in mm. Defaults to 0.15 mm. */
  traceWidth?: number
}

/**
 * Resolve the trace width (mm) for a connection object.
 * Falls back to the standard 0.15 mm value.
 */
export function resolveTraceWidth(
  connection?: ConnectionWithThickness | null,
): number {
  if (connection?.traceWidth != null && connection.traceWidth > 0) {
    return connection.traceWidth
  }
  return STANDARD_TRACE_THICKNESS_MM
}

/**
 * Resolve the trace width (mm) from a multiple.
 */
export function traceWidthFromMultiple(multiple: TraceThicknessMultiple): number {
  return TRACE_THICKNESS_MM[multiple]
}
