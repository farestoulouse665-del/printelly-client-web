import { describe, expect, it } from "vitest";
import {
  dpiAtWidth,
  fromCentimeters,
  qualityForDpi,
  toCentimeters,
} from "@/lib/dtf";

describe("DTF measurement helpers", () => {
  it("converts centimeters, millimeters, inches and pixels reversibly", () => {
    expect(toCentimeters(fromCentimeters(25, "mm"), "mm")).toBeCloseTo(25);
    expect(toCentimeters(fromCentimeters(25, "in"), "in")).toBeCloseTo(25);
    expect(toCentimeters(fromCentimeters(25, "px", 300), "px", 300)).toBeCloseTo(25);
    expect(toCentimeters(10, "cm")).toBe(10);
  });

  it("computes physical DPI from actual pixels", () => {
    expect(dpiAtWidth(1181, 10)).toBeCloseTo(299.97, 1);
    expect(dpiAtWidth(3000, 25.4)).toBeCloseTo(300, 4);
    expect(dpiAtWidth(3000, 0)).toBe(0);
  });

  it("uses explicit print-quality thresholds", () => {
    expect(qualityForDpi(300)).toEqual({ label: "Excellente", tone: "good" });
    expect(qualityForDpi(250)).toEqual({ label: "À vérifier", tone: "warning" });
    expect(qualityForDpi(149)).toEqual({ label: "Insuffisante", tone: "danger" });
  });
});
