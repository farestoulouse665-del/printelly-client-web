import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const loader = await readFile(new URL("../../studio-credit-badge.js", import.meta.url), "utf8");
const studio = await readFile(new URL("../../studio-pro-upgrade.js", import.meta.url), "utf8");
const bridge = await readFile(new URL("../../studio-order-bridge.js", import.meta.url), "utf8");
const css = await readFile(new URL("../../studio-pro-upgrade.css", import.meta.url), "utf8");
const clientHtml = await readFile(new URL("../../index.html", import.meta.url), "utf8");
const serviceWorker = await readFile(new URL("../../sw.js", import.meta.url), "utf8");

test("Studio AI loads the professional upgrade", () => {
  assert.match(loader, /studio-pro-upgrade\.css/);
  assert.match(loader, /studio-pro-upgrade\.js/);
  assert.doesNotThrow(() => new vm.Script(studio));
});

test("simple mode and redundant removal panels are removed at runtime", () => {
  assert.match(studio, /dataset\.studioMode = "pro"/);
  assert.match(studio, /querySelector\("\.br-studio-mode"\)/);
  assert.match(studio, /modePicker\.remove\(\)/);
  assert.match(studio, /brAdvancedSection/);
  assert.match(studio, /brRemovalMenu/);
  assert.match(studio, /removedFromStudio/);
});

test("professional color controls and DTF preflight are present", () => {
  ["Exposition", "Luminosité", "Contraste", "Saturation", "Vibrance", "Température", "Ombres", "Hautes lumières", "Noirs", "Blancs", "Détails fins"].forEach((label) => assert.match(studio, new RegExp(label)));
  assert.match(studio, /PRÉFLIGHT PROFESSIONNEL/);
  assert.match(studio, /PRÊT À IMPRIMER/);
  assert.match(studio, /NON CONFORME/);
  assert.match(css, /br-pro-command-center/);
  assert.match(css, /br-pro-color-controls/);
});

test("Studio AI handoff persists the PNG and opens Photos à organiser", () => {
  assert.match(studio, /indexedDB\.open/);
  assert.match(studio, /printellyStudioPendingOrder/);
  assert.match(studio, /\?view=new-order&studio=1/);
  assert.match(bridge, /state\.files\.push/);
  assert.match(bridge, /setView\("new-order"\)/);
  assert.match(bridge, /OPTIMISÉ AVEC STUDIO AI/);
  assert.match(clientHtml, /studio-order-bridge\.js/);
  assert.doesNotThrow(() => new vm.Script(bridge));
});

test("new assets are versioned in the offline cache", () => {
  assert.match(serviceWorker, /studio-pro-upgrade\.css/);
  assert.match(serviceWorker, /studio-pro-upgrade\.js/);
  assert.match(serviceWorker, /studio-order-bridge\.js/);
});
