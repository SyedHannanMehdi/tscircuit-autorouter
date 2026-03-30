import { describe, it, expect } from "vitest"
import {
  IPC_MIN_CLEARANCE_MM,
  getObstacleMargin,
  inflateObstacleRadius,
  inflateObstacleRect,
} from "../../lib/utils/get-obstacle-margin"

describe("get-obstacle-margin", () => {
  it("IPC minimum clearance is 0.1 mm", () => {
    expect(IPC_MIN_CLEARANCE_MM).toBe(0.1)
  })

  it("getObstacleMargin defaults to standard trace", () => {
    // half of 0.15 + 0.1 = 0.175
    expect(getObstacleMargin()).toBeCloseTo(0.175)
    expect(getObstacleMargin(0.15)).toBeCloseTo(0.175)
  })

  it("getObstacleMargin scales with trace width", () => {
    // half of 0.30 + 0.1 = 0.25
    expect(getObstacleMargin(0.30)).toBeCloseTo(0.25)
    // half of 0.60 + 0.1 = 0.40
    expect(getObstacleMargin(0.60)).toBeCloseTo(0.40)
    // half of 1.20 + 0.1 = 0.70
    expect(getObstacleMargin(1.20)).toBeCloseTo(0.70)
  })

  it("inflateObstacleRadius sums pad radius and margin", () => {
    // padRadius=0.3, trace=0.15 → 0.3 + 0.175 = 0.475
    expect(inflateObstacleRadius(0.3, 0.15)).toBeCloseTo(0.475)
    // padRadius=0.3, trace=0.30 → 0.3 + 0.25 = 0.55
    expect(inflateObstacleRadius(0.3, 0.30)).toBeCloseTo(0.55)
  })

  it("inflateObstacleRect expands both half-extents by margin", () => {
    const result = inflateObstacleRect(0.5, 0.5, 0.15)
    expect(result.halfW).toBeCloseTo(0.5 + 0.175)
    expect(result.halfH).toBeCloseTo(0.5 + 0.175)
  })

  it("inflateObstacleRect with 4x trace expands more", () => {
    const result = inflateObstacleRect(0.5, 0.5, 0.60)
    expect(result.halfW).toBeCloseTo(0.5 + 0.40)
    expect(result.halfH).toBeCloseTo(0.5 + 0.40)
  })
})
