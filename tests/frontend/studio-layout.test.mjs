import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const clientHtml = await readFile(new URL("../../index.html", import.meta.url), "utf8");
const html = await readFile(new URL("../../background-studio/index.html", import.meta.url), "utf8");
const dockerfile = await readFile(new URL("../../Dockerfile.frontend", import.meta.url), "utf8");
const css = await readFile(new URL("../../background-remover.css", import.meta.url), "utf8");
const editor = await readFile(new URL("../../background-remover.js", import.meta.url), "utf8");
const appSource = await readFile(new URL("../../app.js", import.meta.url), "utf8");


test("background studio is separated from the client shell and requires the shared account", () => {
  assert.doesNotMatch(clientHtml, /data-view="background-remover"/);
  assert.doesNotMatch(clientHtml, /id="bgRemoverView"/);
  assert.doesNotMatch(clientHtml, /background-remover\.js/);
  assert.doesNotMatch(clientHtml, /background-remover\.css/);
  assert.match(html, /COMPTE PRINTELLY • ACCÈS SÉCURISÉ/);\n  assert.match(html, /id="studioCreditsBadge"/);\n  assert.match(html, /href="\.\.\/studio-packs\//);
  assert.doesNotMatch(html, /id="authView"/);
  assert.doesNotMatch(html, /id="loginForm"/);
  assert.doesNotMatch(html, /id="signupForm"/);
  assert.doesNotMatch(html, /src="\.\.\/app\.js"/);
  assert.match(html, /id="brAddToOrder"[^>]*hidden/);
  assert.match(dockerfile, /COPY background-studio \/usr\/share\/nginx\/html\/background-studio/);
});

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
    "brBlackBackgroundMode",
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

test("black background modes protect subject structure", () => {
  assert.match(html, /value="exterior">Noir extérieur seulement/);
  assert.match(html, /value="smart">Tous les fonds noirs intelligents/);
  assert.match(editor, /blackBackgroundMode:/);
  assert.match(editor, /blackBackgroundConfidence/);
});

test("canvas exposes a direct move control", () => {
  assert.match(html, /id="brCanvasPan"/);
  assert.match(html, /id="brCanvasPan"[^>]+data-br-tool="pan"/);
  assert.match(css, /\.br-canvas-pan\{/);
  assert.match(css, /\.br-canvas-pan:hover,\.br-canvas-pan\.active/);
});

test("desktop canvas keeps a stable geometry between images", () => {
  assert.match(css, /grid-template-rows:minmax\(0,1fr\) 84px/);
  assert.match(css, /height:84px/);
  assert.match(css, /min-height:84px/);
  assert.match(css, /max-height:84px/);
  assert.match(css, /Keep the central studio geometrically stable/);
});

test("expanded canvas mode keeps editor side panels and is user controlled", () => {
  assert.doesNotMatch(appSource, /classList\.toggle\("br-studio-active",name==="background-remover"\)/);
  assert.match(html, /id="brCanvasFullscreen"/);
  assert.ok(html.indexOf('id="brCanvasShell"') < html.indexOf('id="brCanvasFullscreen"'));
  assert.match(editor, /function setExpandedWorkspace/);
  assert.match(editor, /canvasFullscreen\.addEventListener\("click"/);
  assert.match(editor, /key === "escape"/);
  assert.match(css, /body\.br-studio-active \.app-content/);
  assert.doesNotMatch(css, /body\.br-studio-active \.br-controls[^}]*display:none/);
  assert.doesNotMatch(css, /body\.br-studio-active \.br-right-controls[^}]*display:none/);
});

test("difficult-background assistant replaces layers and snapshots", () => {
  assert.doesNotMatch(html, /id="brLayersMenu"/);
  assert.doesNotMatch(html, /id="brSnapshotsMenu"/);
  assert.doesNotMatch(html, /id="brCreateSnapshot"/);
  assert.match(html, /id="brDifficultBackgroundMenu"/);
  assert.match(html, /id="brScanResidues"/);
  assert.match(html, /id="brForgottenClick"/);
  assert.match(html, /id="brMultiPoint"/);
  assert.match(html, /id="brAssistantStatus"/);
  assert.match(editor, /multiPointMode: false/);
  assert.match(editor, /method === "manual" \|\| remover\.multiPointMode/);
  assert.match(editor, /runQualityInspection\(false\)/);
  assert.match(editor, /ui\.forgottenClick\.addEventListener/);
  assert.match(editor, /ui\.multiPoint\.addEventListener/);
});

test("professional keyboard shortcuts ignore editable fields", () => {
  assert.match(editor, /target\.matches\("input,textarea,select"\)/);
  assert.match(editor, /key === "b"/);
  assert.match(editor, /key === "e"/);
  assert.match(editor, /key === "h"/);
  assert.match(editor, /event\.code === "Space"/);
  assert.doesNotThrow(() => new vm.Script(editor));
});

test("mobile layout returns to one column without losing the canvas", () => {
  assert.match(css, /@media\(max-width:1100px\)/);
  assert.match(css, /grid-template-columns:1fr/);
  assert.match(css, /\.br-preview-column\{order:1/);
});


test("Simple and Pro modes expose progressive professional controls", () => {
  assert.match(html, /data-studio-mode="simple"/);
  assert.match(html, /data-br-studio-mode="simple"/);
  assert.match(html, /data-br-studio-mode="pro"/);
  assert.match(html, /data-br-pro-only/);
  assert.match(css, /data-studio-mode="simple"/);
  assert.match(editor, /function setStudioMode/);
  assert.match(editor, /printellyStudioMode/);
});

test("print studio exposes physical size, DPI and real PNG export", () => {
  [
    "brPrintWidth",
    "brPrintHeight",
    "brPrintUnit",
    "brExportDpi",
    "brCustomDpi",
    "brDpiMode",
    "brLockPrintRatio",
    "brPrintSummary",
    "brPrintPixels",
    "brEffectiveDpi"
  ].forEach((id) => assert.match(html, new RegExp('id="' + id + '"')));
  assert.match(html, /background-print-export\.js/);
  assert.match(editor, /PrintellyPrintExport\.calculate/);
  assert.match(editor, /PrintellyPrintExport\.embedPngDpi/);
  assert.match(editor, /imageSmoothingQuality = "high"/);
  assert.match(editor, /40 mégapixels/);
  assert.doesNotThrow(() => new vm.Script(editor));
});


test("exterior magic eraser is explicit, protected and undoable", () => {
  assert.match(html, /data-br-tool="magic-exterior"/);
  assert.match(html, /id="brMagicTolerance"/);
  assert.match(html, /zone intérieure fermée ne sera jamais supprimée/);
  assert.match(editor, /function eraseMagicExterior/);
  assert.match(editor, /PrintellyColorSelection\.magicExterior/);
  assert.match(editor, /source: "magic-exterior"/);
  assert.match(editor, /remover\.actions\.push/);
  assert.match(css, /data-tool="magic-exterior"/);
  assert.doesNotThrow(() => new vm.Script(editor));
});
