import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("../../background-removal-api.js", import.meta.url), "utf8");
const editorSource = await readFile(new URL("../../background-remover.js", import.meta.url), "utf8");

test("typed client sends semantic mode and refinement options", async () => {
  let captured;
  const context = {
    window: {},
    FormData,
    Blob,
    fetch: async (url, options) => {
      captured = { url, options };
      return new Response(new Blob(["png"], { type: "image/png" }), {
        status: 200,
        headers: {
          "content-type": "image/png",
          "x-image-width": "10",
          "x-image-height": "12",
          "x-processing-ms": "25",
          "x-foreground-ratio": "0.5",
          "x-residual-haze": "0.012",
          "x-model-name": "test",
          "x-warnings": "[]"
        }
      });
    }
  };
  vm.runInNewContext(source, context);
  const file = new Blob(["image"], { type: "image/png" });
  Object.defineProperty(file, "name", { value: "design.png" });
  const result = await context.window.PrintellyBackgroundApi.remove(
    "http://localhost:8000/",
    file,
    {
      mode: "design",
      feather: 1,
      edgeShift: 0,
      decontaminate: true,
      backgroundCleanup: "strong",
      protectDetails: true,
      removeHaze: true,
      backgroundColor: "#ffffff"
    }
  );
  assert.equal(captured.url, "http://localhost:8000/api/remove-background");
  assert.equal(captured.options.body.get("mode"), "design");
  assert.equal(captured.options.body.get("background_cleanup"), "strong");
  assert.equal(captured.options.body.get("protect_details"), "true");
  assert.equal(captured.options.body.get("remove_haze"), "true");
  assert.equal(captured.options.body.get("background_color"), "#ffffff");
  assert.equal(result.metadata.width, 10);
  assert.equal(result.metadata.residualHazeRatio, 0.012);
  assert.equal(result.blob.type, "image/png");
});

test("service worker excludes private API responses from cache", async () => {
  const worker = await readFile(new URL("../../sw.js", import.meta.url), "utf8");
  assert.match(worker, /pathname\.startsWith\("\/api\/"\)/);
  assert.match(worker, /printelly-client-v36/);
});


test("private HTTPS sharing uses the frontend origin for API requests", () => {
  assert.match(editorSource, /return window\.location\.origin/);
  assert.match(editorSource, /!isLocalPage && savedIsLocal/);
  assert.doesNotMatch(editorSource, /if \(saved !== null\) return saved;\s*return "http:\/\/localhost:8000";/);
});
