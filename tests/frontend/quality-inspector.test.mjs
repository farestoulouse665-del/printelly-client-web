import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("../../background-quality.js", import.meta.url), "utf8");
const htmlSource = await readFile(new URL("../../index.html", import.meta.url), "utf8");
const dockerSource = await readFile(new URL("../../Dockerfile.frontend", import.meta.url), "utf8");

function loadInspector() {
  const context = {
    window: {},
    Uint8Array,
    Uint8ClampedArray,
    Int32Array,
    Float32Array,
    Math,
    Number,
    Object,
    Error
  };
  vm.runInNewContext(source, context);
  return context.window.PrintellyQualityInspector;
}

function pixels(width, height, rgb = [80, 90, 100]) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    data[index * 4] = rgb[0];
    data[index * 4 + 1] = rgb[1];
    data[index * 4 + 2] = rgb[2];
    data[index * 4 + 3] = 255;
  }
  return { data };
}

test("quality inspector detects isolated foreground fragments", () => {
  const inspector = loadInspector();
  const width = 9;
  const height = 9;
  const alpha = new Float32Array(width * height);
  for (let y = 3; y <= 5; y += 1) {
    for (let x = 3; x <= 5; x += 1) alpha[y * width + x] = 1;
  }
  alpha[0] = 1;
  const report = inspector.inspect(pixels(width, height), alpha, width, height, { microPixelLimit: 4 });
  assert.equal(report.microCount, 1);
  assert.ok(report.issues.some(issue => issue.type === "micro"));
  assert.equal(report.microMask[0], 1);
});

test("quality inspector finds enclosed transparent holes", () => {
  const inspector = loadInspector();
  const width = 7;
  const height = 7;
  const alpha = new Float32Array(width * height).fill(1);
  alpha[3 * width + 3] = 0;
  alpha[3 * width + 4] = 0;
  const report = inspector.inspect(pixels(width, height), alpha, width, height, { microPixelLimit: 2 });
  assert.equal(report.holes.length, 1);
  assert.ok(report.issues.some(issue => issue.type === "holes"));
});

test("DPI uses the original image width rather than the reduced preview", () => {
  const inspector = loadInspector();
  const width = 100;
  const height = 100;
  const alpha = new Float32Array(width * height).fill(1);
  alpha[0] = 0;
  const report = inspector.inspect(pixels(width, height), alpha, width, height, {
    printWidthCm: 25.4,
    sourceWidth: 3000,
    microPixelLimit: 2
  });
  assert.equal(Math.round(report.dpi), 300);
  assert.ok(!report.issues.some(issue => issue.type === "dpi"));
});

test("quality inspector is wired into HTML and Docker", () => {
  assert.match(htmlSource, /id="brQualityPanel"/);
  assert.match(htmlSource, /background-quality\.js/);
  assert.match(dockerSource, /background-quality\.js/);
  assert.match(dockerSource, /background-print-export\.js/);
  assert.match(htmlSource, /id="brExportDpi"/);
  assert.match(htmlSource, /id="brDpiMode"/);
});
