import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const html = await readFile(new URL("../../index.html", import.meta.url), "utf8");
const css = await readFile(new URL("../../background-remover.css", import.meta.url), "utf8");
const editor = await readFile(new URL("../../background-remover.js", import.meta.url), "utf8");

test("professional studio exposes left, canvas and right work areas", () => {
  assert.match(html, /id="brLeftControls"/);
  assert.match(html, /class="br-preview-column"/);
  assert.match(html, /id="brRightControls"/);
  const leftIndex = html.indexOf('id="brLeftControls"');
  const canvasIndex = html.indexOf('class="br-preview-column"');
  const rightIndex = html.indexOf('id="brRightControls"');
  assert.ok(leftIndex < canvasIndex);
  assert.ok(canvasIndex < rightIndex);
  assert.match(css, /grid-template-areas:"left center right"/);
  assert.match(css, /grid-template-columns:minmax\(230px,280px\) minmax\(560px,1fr\) minmax\(245px,295px\)/);
  assert.match(css, /\.br-preview-column\{grid-area:center\}/);
});

test("side panels are independently scrollable and collapsible", () => {
  assert.match(html, /id="brToggleLeft"/);
  assert.match(html, /id="brToggleRight"/);
  assert.match(css, /overscroll-behavior:contain/);
  assert.match(css, /br-left-collapsed/);
  assert.match(css, /br-right-collapsed/);
  assert.match(editor, /setupProfessionalStudio/);
  assert.match(editor, /ui\.rightControls\.appendChild\(panel\)/);
  assert.match(editor, /localStorage\.setItem\("printellyStudio"/);
  assert.match(editor, /isLeft \? "Left" : "Right"/);
});

test("all existing professional tools are retained", () => {
  [
    "brRemovalMenu",
    "brPaletteMenu",
    "brBrush",
    "brUndo",
    "brRedo",
    "brQualityPanel",
    "brDownload",
    "brAddToOrder"
  ].forEach((id) => assert.match(html, new RegExp('id="' + id + '"')));
  assert.doesNotThrow(() => new vm.Script(editor));
});

test("canvas exposes a direct move control", () => {
  assert.match(html, /id="brCanvasPan"/);
  assert.match(html, /id="brCanvasPan"[^>]+data-br-tool="pan"/);
  assert.match(css, /\.br-canvas-pan\{/);
  assert.match(css, /\.br-canvas-pan:hover,\.br-canvas-pan\.active/);
});

test("mobile layout returns to one column without losing the canvas", () => {
  assert.match(css, /@media\(max-width:1100px\)/);
  assert.match(css, /grid-template-columns:1fr/);
  assert.match(css, /\.br-preview-column\{order:1/);
});
