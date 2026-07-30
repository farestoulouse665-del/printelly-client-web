export type MeasurementUnit = "cm" | "mm" | "in" | "px";

export function fromCentimeters(
  value: number,
  unit: MeasurementUnit,
  referenceDpi = 300,
): number {
  if (unit === "mm") return value * 10;
  if (unit === "in") return value / 2.54;
  if (unit === "px") return (value / 2.54) * referenceDpi;
  return value;
}

export function toCentimeters(
  value: number,
  unit: MeasurementUnit,
  referenceDpi = 300,
): number {
  if (unit === "mm") return value / 10;
  if (unit === "in") return value * 2.54;
  if (unit === "px") return (value / Math.max(referenceDpi, 1)) * 2.54;
  return value;
}

export function dpiAtWidth(pixelWidth: number, widthCm: number): number {
  if (!Number.isFinite(pixelWidth) || !Number.isFinite(widthCm) || widthCm <= 0) {
    return 0;
  }
  return pixelWidth / (widthCm / 2.54);
}

export function dpiForPrintSize(
  pixelWidth: number,
  pixelHeight: number,
  widthCm: number,
  heightCm: number,
): number {
  const horizontal = dpiAtWidth(pixelWidth, widthCm);
  const vertical = dpiAtWidth(pixelHeight, heightCm);
  if (!horizontal || !vertical) return 0;
  return Math.min(horizontal, vertical);
}

export function maximumPrintSizeAtDpi(
  pixelWidth: number,
  pixelHeight: number,
  targetDpi = 300,
): { widthCm: number; heightCm: number } {
  if (
    !Number.isFinite(pixelWidth) ||
    !Number.isFinite(pixelHeight) ||
    !Number.isFinite(targetDpi) ||
    pixelWidth <= 0 ||
    pixelHeight <= 0 ||
    targetDpi <= 0
  ) {
    return { widthCm: 0, heightCm: 0 };
  }
  return {
    widthCm: (pixelWidth / targetDpi) * 2.54,
    heightCm: (pixelHeight / targetDpi) * 2.54,
  };
}

export function qualityForDpi(dpi: number): {
  label: "Excellente" | "À vérifier" | "Insuffisante";
  tone: "good" | "warning" | "danger";
} {
  if (dpi >= 300) return { label: "Excellente", tone: "good" };
  if (dpi >= 200) return { label: "À vérifier", tone: "warning" };
  return { label: "Insuffisante", tone: "danger" };
}
