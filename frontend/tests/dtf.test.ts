import { describe, expect, it } from "vitest";
import {
  dpiAtWidth,
  dpiForPrintSize,
  fromCentimeters,
  maximumPrintSizeAtDpi,
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

  it("uses the limiting image axis for the available print DPI", () => {
    expect(dpiForPrintSize(3000, 2400, 25.4, 20.32)).toBeCloseTo(300, 4);
    expect(dpiForPrintSize(3000, 1000, 25.4, 20.32)).toBeCloseTo(125, 4);
    expect(dpiForPrintSize(3000, 1000, 0, 20.32)).toBe(0);
  });

  it("reports the maximum physical size at 300 DPI", () => {
    expect(maximumPrintSizeAtDpi(3000, 2400)).toEqual({
      widthCm: 25.4,
      heightCm: 20.32,
    });
    expect(maximumPrintSizeAtDpi(0, 2400)).toEqual({ widthCm: 0, heightCm: 0 });
  });

  it("uses explicit print-quality thresholds", () => {
    expect(qualityForDpi(300)).toEqual({ label: "Excellente", tone: "good" });
    expect(qualityForDpi(250)).toEqual({ label: "À vérifier", tone: "warning" });
    expect(qualityForDpi(149)).toEqual({ label: "Insuffisante", tone: "danger" });
  });
});
