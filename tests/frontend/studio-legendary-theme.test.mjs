import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const css = await readFile(new URL("../../studio-legendary-theme.css", import.meta.url), "utf8");
const standalone = await readFile(new URL("../../background-studio/standalone.css", import.meta.url), "utf8");
const loader = await readFile(new URL("../../studio-credit-badge.js", import.meta.url), "utf8");
const legendary = await readFile(new URL("../../studio-legendary-ui.js", import.meta.url), "utf8");
const workflow = await readFile(new URL("../../.github/workflows/studio-ai-quality.yml", import.meta.url), "utf8");


test("legendary Studio theme centralizes dark production tokens", () => {
  [
    "--studio-bg-main", "--studio-bg-panel", "--studio-bg-input",
    "--studio-text-primary", "--studio-text-secondary", "--studio-accent",
    "--studio-warning", "--studio-danger"
  ].forEach((token) => assert.match(css, new RegExp(token)));
  assert.match(css, /color-scheme:dark/);
  assert.doesNotMatch(css, /#fff7f6|#fafafb|#eef0f3/i);
  assert.doesNotMatch(standalone, /color-scheme:light/);
});


test("workspace is stable and responsive instead of fixed to a broken viewport height", () => {
  assert.match(css, /grid-template-areas:"left center right"/);
  assert.match(css, /height:auto/);
  assert.match(css, /min-height:720px/);
  assert.match(css, /@media\(max-width:1180px\)/);
  assert.match(css, /@media\(max-width:820px\)/);
  assert.match(css, /@media\(max-width:560px\)/);
});


test("final order action remains visible in standalone Studio", () => {
  assert.doesNotMatch(standalone, /#brAddToOrder\s*\{[^}]*display:none!important/s);
  assert.match(css, /#brAddToOrder\{display:inline-flex!important/);
});


test("legendary UI groups color tools and exposes a professional final summary", () => {
  assert.match(legendary, /studio-control-group/);
  assert.match(legendary, /studio-slider-reset/);
  assert.match(legendary, /studio-final-summary/);
  assert.match(legendary, /Photos à organiser/);
  assert.match(legendary, /studioThemeReady/);
  assert.doesNotThrow(() => new vm.Script(legendary));
});


test("loader restores the selected theme before loading upgrade scripts", () => {
  assert.match(loader, /dataset\.studioTheme = theme/);
  assert.match(loader, /classList\.add\("br-pro-upgraded"\)/);
  assert.match(loader, /classList\.toggle\("br-legendary-theme", theme === "legendary"\)/);
  assert.ok(loader.indexOf("dataset.studioTheme") < loader.indexOf("studio-pro-upgrade.js"));
  assert.ok(loader.indexOf("studio-pro-upgrade.js") < loader.indexOf("studio-three-themes.js"));
  assert.doesNotThrow(() => new vm.Script(loader));
});


test("Studio quality workflow executes Python visual audits", () => {
  assert.match(workflow, /actions\/setup-python@v5/);
  assert.match(workflow, /audit_studio_theme\.py/);
  assert.match(workflow, /check_css_contrast\.py/);
  assert.match(workflow, /check_studio_layout\.py/);
  assert.match(workflow, /check_studio_theme_modes\.py/);
  assert.match(workflow, /check_studio_upscale\.py/);
  assert.match(workflow, /tools\/\*\*/);
});
