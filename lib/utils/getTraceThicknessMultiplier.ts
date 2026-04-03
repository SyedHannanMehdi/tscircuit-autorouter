/**
 * Converts a trace thickness multiplier level to the actual multiplier value.
 * Industry standard is 0.15mm, so:
 * - 1x = 0.15mm (default)
 * - 2x = 0.3mm
 * - 4x = 0.6mm
 * - 8x = 1.2mm
 *
 * @param multiplier - The thickness multiplier (1, 2, 4, or 8)
 * @returns The actual multiplier value
 */
export function getTraceThicknessMultiplier(multiplier: 1 | 2 | 4 | 8): number {
  const multipliers: Record<1 | 2 | 4 | 8, number> = {
    1: 1,
    2: 2,
    4: 4,
    8: 8,
  }
  return multipliers[multiplier]
}

/**
 * Calculates the actual trace thickness in mm from a multiplier.
 * Base thickness is 0.15mm (industry standard data line thickness).
 *
 * @param multiplier - The thickness multiplier (1, 2, 4, or 8)
 * @returns The actual thickness in mm
 */
export function calculateTraceThicknessMM(
  multiplier: 1 | 2 | 4 | 8 = 1,
): number {
  const BASE_TRACE_THICKNESS = 0.15 // mm
  return BASE_TRACE_THICKNESS * getTraceThicknessMultiplier(multiplier)
}

/**
 * Validates if a multiplier is valid (must be 1, 2, 4, or 8).
 *
 * @param multiplier - The multiplier to validate
 * @returns True if valid, false otherwise
 */
export function isValidTraceThicknessMultiplier(
  multiplier: number,
): multiplier is 1 | 2 | 4 | 8 {
  return multiplier === 1 || multiplier === 2 || multiplier === 4 || multiplier === 8
}
