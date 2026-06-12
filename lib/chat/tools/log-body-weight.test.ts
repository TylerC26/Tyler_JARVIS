import { describe, expect, test } from "vitest";
import { logBodyWeightInput, toKg } from "./log-body-weight";

describe("toKg", () => {
  test("kg passes through unchanged", () => {
    expect(toKg(84.2, "kg")).toBe(84.2);
  });

  test("converts 185 lb to 83.91 kg (0.45359237 factor, 2dp)", () => {
    expect(toKg(185, "lb")).toBe(83.91);
  });

  test("converts 200 lb to 90.72 kg", () => {
    // 200 × 0.45359237 = 90.718474 → rounds to 90.72
    expect(toKg(200, "lb")).toBe(90.72);
  });

  test("normalizes float noise in kg input to 2 decimals", () => {
    expect(toKg(84.123456, "kg")).toBe(84.12);
  });
});

describe("logBodyWeightInput", () => {
  test("accepts kg and lb units only", () => {
    expect(logBodyWeightInput.safeParse({ weight: 84, unit: "kg" }).success).toBe(true);
    expect(logBodyWeightInput.safeParse({ weight: 185, unit: "lb" }).success).toBe(true);
    expect(logBodyWeightInput.safeParse({ weight: 13, unit: "st" }).success).toBe(false);
  });

  test("rejects non-positive weight", () => {
    expect(logBodyWeightInput.safeParse({ weight: 0, unit: "kg" }).success).toBe(false);
    expect(logBodyWeightInput.safeParse({ weight: -80, unit: "kg" }).success).toBe(false);
  });
});
