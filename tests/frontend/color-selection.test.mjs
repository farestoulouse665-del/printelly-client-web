import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("../../background-color-selection.js", import.meta.url), "utf8");
const editorSource = await readFile(new URL("../../background-remover.js", import.meta.url), "utf8");
const htmlSource = await readFile(new URL("../../index.html", import.meta.url), "utf8");

function loadEngine() {
  const context = { window: {}, Uint8Array, Uint8ClampedArray, Int32Array, Error, Math, Number };
  vm.runInNewContext(source, context);
  return context.window.PrintellyColorSelection;
}

function image(width, height, color) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    data[index * 4] = color[0];
    data[index * 4 + 1] = color[1];
    data[index * 4 + 2] = color[2];
    data[index * 4 + 3] = 255;
  }
  return { data };
}

test("local color selection never erases the same color across a separating object", () => {
  const engine = loadEngine();
  const width = 7;
  const height = 3;
  const pixels = image(width, height, [250, 250, 250]);
  for (let y = 0; y < height; y += 1) {
    const offset = (y * width + 3) * 4;
    pixels.data[offset] = pixels.data[offset + 1] = pixels.data[offset + 2] = 0;
  }
  const result = engine.connectedRegion(pixels, width, height, 1, 1, 12);
  assert.equal(result.count, 9);
  assert.equal(result.mask[1 * width + 1], 1);
  assert.equal(result.mask[1 * width + 5], 0);
});

test("global color removes enclosed matches while exterior mode preserves them", () => {
  const engine = loadEngine();
  const width = 5;
  const height = 5;
  const pixels = image(width, height, [255, 255, 255]);
  const ring = [[1,1],[2,1],[3,1],[1,2],[3,2],[1,3],[2,3],[3,3]];
  for (const [x, y] of ring) {
    const offset = (y * width + x) * 4;
    pixels.data[offset] = pixels.data[offset + 1] = pixels.data[offset + 2] = 0;
  }
  const color = engine.colorAt(pixels, width, height, 0, 0);
  const global = engine.matchingColor(pixels, width, height, color, 5);
  const exterior = engine.exteriorColor(pixels, width, height, color, 5);
  assert.equal(global.mask[2 * width + 2], 1);
  assert.equal(exterior.mask[2 * width + 2], 0);
  assert.equal(exterior.mask[0], 1);
});

test("guided manual selection never escapes the painted safety zone", () => {
  const engine = loadEngine();
  const width = 6;
  const height = 3;
  const pixels = image(width, height, [255, 255, 255]);
  const guide = new Uint8Array(width * height);
  guide[1 * width + 1] = 1;
  guide[1 * width + 2] = 1;
  guide[1 * width + 3] = 1;
  const offset = (1 * width + 2) * 4;
  pixels.data[offset] = pixels.data[offset + 1] = pixels.data[offset + 2] = 0;
  const color = engine.colorAt(pixels, width, height, 1, 1);
  const result = engine.guidedSelection(pixels, width, height, guide, color, 8);
  assert.deepEqual(Array.from(result.mask), [
    0, 0, 0, 0, 0, 0,
    0, 1, 0, 1, 0, 0,
    0, 0, 0, 0, 0, 0
  ]);
  assert.equal(result.count, 2);
});

test("tolerance includes nearby JPEG shades and eraseMask only changes alpha", () => {
  const engine = loadEngine();
  const pixels = image(3, 1, [255, 255, 255]);
  pixels.data[4] = pixels.data[5] = pixels.data[6] = 242;
  pixels.data[8] = pixels.data[9] = pixels.data[10] = 120;
  const result = engine.connectedRegion(pixels, 3, 1, 0, 0, 8);
  const alpha = new Float32Array([1, 0.6, 0.9]);
  engine.eraseMask(alpha, result.mask);
  assert.deepEqual(Array.from(result.mask), [1, 1, 0]);
  assert.deepEqual(Array.from(alpha), [0, 0, 0.8999999761581421]);
});


test("editor exposes every removal method and remains valid JavaScript", () => {
  assert.doesNotThrow(() => new vm.Script(editorSource));
  assert.match(htmlSource, /value="global"/);
  assert.match(htmlSource, /value="exterior"/);
  assert.match(htmlSource, /value="manual"/);
  assert.match(htmlSource, /background-color-selection\.js/);
  assert.match(editorSource, /paintSelectionAction/);
  assert.match(editorSource, /pendingSelection/);
  assert.match(editorSource, /beginManualGuide/);
  assert.match(editorSource, /guidedSelection/);
});
