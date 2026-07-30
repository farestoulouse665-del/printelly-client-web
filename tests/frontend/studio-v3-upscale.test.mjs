import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const loader = await readFile(new URL("../../studio-credit-badge.js", import.meta.url), "utf8");
const themes = await readFile(new URL("../../studio-three-themes.js", import.meta.url), "utf8");
const themeCss = await readFile(new URL("../../studio-three-themes.css", import.meta.url), "utf8");
const upscale = await readFile(new URL("../../studio-upscale.js", import.meta.url), "utf8");
const upscaleCss = await readFile(new URL("../../studio-upscale.css", import.meta.url), "utf8");
const legendaryUi = await readFile(new URL("../../studio-legendary-ui.js", import.meta.url), "utf8");
const worker = await readFile(new URL("../../sw.js", import.meta.url), "utf8");

test("loader restores theme before loading Studio V3 modules", () => {
  assert.match(loader, /printellyStudioTheme/);
  assert.match(loader, /dataset\.studioTheme/);
  assert.match(loader, /studio-three-themes\.css/);
  assert.match(loader, /studio-three-themes\.js/);
  assert.match(loader, /studio-upscale\.js/);
  assert.doesNotThrow(() => new vm.Script(loader));
});

test("three visual themes are complete and persisted", () => {
  ["light", "dark", "legendary"].forEach((theme) => {
    assert.match(themeCss, new RegExp(`data-studio-theme=\\"${theme}\\"`));
  });
  assert.match(themes, /localStorage\.setItem\(STORAGE_KEY/);
  assert.match(themes, /data-studio-theme-choice/);
  assert.match(themes, /aria-pressed/);
  assert.doesNotThrow(() => new vm.Script(themes));
});

test("obsolete finishing and recovery systems leave the rendered Studio", () => {
  assert.match(themes, /brAdvancedSection/);
  assert.match(themes, /recovery\.remove\(\)/);
  assert.match(themes, /brRemovalMenu/);
  assert.match(themes, /removal\.remove\(\)/);
  assert.match(themes, /data-br-view=\\"result\\"/);
  assert.match(themes, /right\.remove\(\)/);
  assert.doesNotMatch(legendaryUi, /<span>FINITION<\/span>/);
  assert.doesNotMatch(legendaryUi, /title:\s*"Finition"/);
});

test("before and after becomes the primary post-processing view", () => {
  assert.match(themes, /AVANT \/ APRÈS/);
  assert.match(themes, /splitButton\.click\(\)/);
  assert.match(themes, /splitInput\.value = "50"/);
  assert.match(themes, /studioBeforeLabel/);
  assert.match(themes, /studioAfterLabel/);
  assert.match(themeCss, /studio-comparison-active/);
});

test("upscale pipeline preserves PNG alpha and caps output at 4K", () => {
  assert.match(upscale, /MAX_4K_EDGE = 3840/);
  assert.match(upscale, /progressiveResize/);
  assert.match(upscale, /edgeAwareSharpen/);
  assert.match(upscale, /source\[i \+ 3\]/);
  assert.match(upscale, /image\/png/);
  assert.match(upscale, /studio-ai-upscale-4k/);
  assert.match(upscale, /AJOUTER 4K À LA COMMANDE/);
  assert.match(upscale, /aucun nouveau crédit/i);
  assert.doesNotThrow(() => new vm.Script(upscale));
  assert.match(upscaleCss, /studio-upscale-panel/);
});

test("offline cache versions every new Studio asset", () => {
  ["studio-three-themes.css", "studio-three-themes.js", "studio-upscale.css", "studio-upscale.js"].forEach((asset) => assert.match(worker, new RegExp(asset.replaceAll(".", "\\."))));
  assert.match(worker, /printelly-client-v50/);
});
