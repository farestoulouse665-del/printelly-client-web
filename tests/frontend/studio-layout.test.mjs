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
  assert.ok(html.indexOf('id="brLeftControls"') < html.indexOf('class="br-preview-column"'));
  assert.ok(html.indexOf('id="brRightControls"') < html.indexOf('class="br-preview-column"'));
  assert.match(css, /grid-template-columns:minmax\(255px,305px\) minmax\(460px,1fr\) minmax\(285px,335px\)/);
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

test("mobile layout returns to one column without losing the canvas", () => {
  assert.match(css, /@media\(max-width:1100px\)/);
  assert.match(css, /grid-template-columns:1fr/);
  assert.match(css, /\.br-preview-column\{order:1/);
});
