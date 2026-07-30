import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("../../background-removal-api.js", import.meta.url), "utf8");

function contextWith(fetchImpl) {
  return {
    window: { dispatchEvent() {} },
    localStorage: { getItem: () => JSON.stringify({ access_token: "jwt-test", expires_at: Math.floor(Date.now() / 1000) + 3600 }) },
    FormData,
    Blob,
    CustomEvent: class CustomEvent { constructor(type, options) { this.type = type; this.detail = options?.detail; } },
    crypto: { randomUUID: () => "11111111-1111-4111-8111-111111111111" },
    fetch: fetchImpl
  };
}

test("typed client sends authenticated semantic options and idempotency key", async () => {
  let captured;
  const context = contextWith(async (url, options) => {
    captured = { url, options };
    return new Response(new Blob(["png"], { type: "image/png" }), {
      status: 200,
      headers: {
        "content-type": "image/png", "x-image-width": "10", "x-image-height": "12",
        "x-processing-ms": "25", "x-foreground-ratio": "0.5", "x-residual-haze": "0.012",
        "x-source-alpha-preserved": "true", "x-effective-mode": "design",
        "x-black-background-mode": "smart", "x-black-background-confidence": "0.875",
        "x-request-id": "abcdef1234567890", "x-model-name": "test", "x-warnings": "[]",
        "x-credits-available": "9", "x-credits-reserved": "0", "x-studio-job-id": "job-test"
      }
    });
  });
  vm.runInNewContext(source, context);
  const file = new Blob(["image"], { type: "image/png" });
  Object.defineProperty(file, "name", { value: "design.png" });
  const result = await context.window.PrintellyBackgroundApi.remove("http://localhost:8000/", file, {
    mode: "design", feather: 1, edgeShift: 0, decontaminate: true,
    backgroundCleanup: "strong", blackBackgroundMode: "smart",
    protectDetails: true, removeHaze: true, backgroundColor: "#ffffff"
  });
  assert.equal(captured.url, "http://localhost:8000/api/remove-background");
  assert.equal(captured.options.headers.Authorization, "Bearer jwt-test");
  assert.equal(captured.options.headers["x-idempotency-key"], "11111111-1111-4111-8111-111111111111");
  assert.equal(captured.options.body.get("mode"), "design");
  assert.equal(captured.options.body.get("background_cleanup"), "strong");
  assert.equal(captured.options.body.get("black_background_mode"), "smart");
  assert.equal(captured.options.body.get("protect_details"), "true");
  assert.equal(captured.options.body.get("remove_haze"), "true");
  assert.equal(captured.options.body.get("background_color"), "#ffffff");
  assert.equal(result.metadata.width, 10);
  assert.equal(result.metadata.residualHazeRatio, 0.012);
  assert.equal(result.metadata.sourceAlphaPreserved, true);
  assert.equal(result.metadata.effectiveMode, "design");
  assert.equal(result.metadata.availableCredits, 9);
  assert.equal(result.metadata.studioJobId, "job-test");
  assert.equal(result.blob.type, "image/png");
});

test("typed client surfaces the safe server request reference", async () => {
  const context = contextWith(async () => new Response(
    JSON.stringify({ detail: "Erreur interne du serveur.", request_id: "abcdef1234567890" }),
    { status: 500, headers: { "content-type": "application/json", "x-request-id": "abcdef1234567890" } }
  ));
  vm.runInNewContext(source, context);
  await assert.rejects(
    () => context.window.PrintellyBackgroundApi.health("http://localhost:8000"),
    /Erreur interne du serveur\. Référence: abcdef123456\./
  );
});

test("service worker excludes cross-origin private API responses from cache", async () => {
  const worker = await readFile(new URL("../../sw.js", import.meta.url), "utf8");
  assert.match(worker, /url\.origin!==self\.location\.origin/);
  assert.match(worker, /pathname\.startsWith\("\/api\/"\)/);
  assert.match(worker, /printelly-client-v47/);
});

test("production requests use the authenticated Supabase Edge Function", () => {
  assert.match(source, /functions\/v1\/printelly-background-removal/);
  assert.match(source, /Authorization/);
  assert.match(source, /printelly_session/);
  assert.doesNotMatch(source, /SUPABASE_SERVICE_ROLE/);
});
