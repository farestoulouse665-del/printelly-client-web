import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("../../background-print-export.js", import.meta.url), "utf8");

function loadModule() {
  const context = {
    window: {},
    Blob,
    Uint8Array,
    Math,
    Number,
    String,
    Error
  };
  vm.runInNewContext(source, context);
  return context.window.PrintellyPrintExport;
}

function chunks(bytes) {
  const result = [];
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const length = (
      bytes[offset] * 0x1000000
      + bytes[offset + 1] * 0x10000
      + bytes[offset + 2] * 0x100
      + bytes[offset + 3]
    ) >>> 0;
    const type = String.fromCharCode(...bytes.slice(offset + 4, offset + 8));
    result.push({ type, data: bytes.slice(offset + 8, offset + 8 + length) });
    offset += length + 12;
    if (type === "IEND") break;
  }
  return result;
}

test("print calculator preserves ratio and computes 300 DPI dimensions", () => {
  const printer = loadModule();
  const result = printer.calculate({
    sourceWidth: 2000,
    sourceHeight: 1000,
    width: 25,
    unit: "cm",
    dpi: 300,
    mode: "resample"
  });
  assert.equal(result.targetWidth, 2953);
  assert.equal(result.targetHeight, 1476);
  assert.equal(result.outputWidth, 2953);
  assert.ok(Math.abs(result.height - 12.5) < 0.001);
  assert.ok(Math.abs(result.effectiveDpi - 203.2) < 0.1);
  assert.equal(result.quality, "warning");
});

test("metadata mode never changes the raster dimensions", () => {
  const printer = loadModule();
  const result = printer.calculate({
    sourceWidth: 4000,
    sourceHeight: 3000,
    width: 20,
    unit: "cm",
    dpi: 600,
    mode: "metadata"
  });
  assert.equal(result.outputWidth, 4000);
  assert.equal(result.outputHeight, 3000);
  assert.equal(result.dpi, 600);
});

test("PNG export writes one standards-compatible pHYs chunk", async () => {
  const printer = loadModule();
  const original = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+7S0Y5QAAAABJRU5ErkJggg==",
    "base64"
  );
  const output = await printer.embedPngDpi(new Blob([original], { type: "image/png" }), 300);
  const parsed = chunks(new Uint8Array(await output.arrayBuffer()));
  const physical = parsed.filter((item) => item.type === "pHYs");
  assert.equal(physical.length, 1);
  const data = physical[0].data;
  const xPixelsPerMeter = (
    data[0] * 0x1000000 + data[1] * 0x10000 + data[2] * 0x100 + data[3]
  ) >>> 0;
  assert.ok(Math.abs(xPixelsPerMeter - 11811) <= 1);
  assert.equal(data[8], 1);
  assert.equal(printer.outputName("logo-sans-fond.png", 300), "logo-sans-fond-300dpi.png");
});
