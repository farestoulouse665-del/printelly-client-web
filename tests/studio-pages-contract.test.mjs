import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("public frontend never contains a privileged Supabase secret", () => {
  const files = [
    "index.html", "background-removal-api.js", "studio-billing-api.js",
    "studio-credit-badge.js", "studio-packs/index.html", "studio-packs/app.js",
    "studio-admin/index.html", "studio-admin/app.js"
  ];
  for (const path of files) {
    assert.doesNotMatch(read(path), /service_role|SUPABASE_SERVICE_ROLE/i, path);
  }
});

test("proof submission cannot approve or grant a pack", () => {
  const source = read("supabase/functions/printelly-studio-billing/index.ts");
  const start = source.indexOf("async function uploadProof");
  const end = source.indexOf("function planPayload", start);
  const uploadProof = source.slice(start, end);
  assert.match(uploadProof, /studio_submit_proof_record/);
  assert.doesNotMatch(uploadProof, /studio_admin_approve|studio_subscriptions|studio_credit_wallets/);
});

test("only the admin approval action calls the atomic approval RPC", () => {
  const source = read("supabase/functions/printelly-studio-billing/index.ts");
  const occurrences = source.match(/studio_admin_approve/g) || [];
  assert.equal(occurrences.length, 1);
  assert.match(source, /if \(action === "approve"\)/);
  assert.match(source, /admin_required/);
});

test("background removal reserves before PhotoRoom and finalizes both outcomes", () => {
  const source = read("supabase/functions/printelly-background-removal/index.ts");
  const reserve = source.indexOf('rpc("studio_reserve_credit"');
  const provider = source.indexOf("PHOTOROOM_SEGMENT_URL", reserve);
  assert.ok(reserve >= 0 && provider > reserve);
  assert.match(source, /p_success:\s*false/);
  assert.match(source, /p_success:\s*true/);
  assert.match(source, /x-credits-available/);
});

test("client checkout is database-driven and exposes no hard-coded CCP number", () => {
  const page = read("studio-packs/app.js");
  assert.match(page, /state\.data\.plans/);
  assert.match(page, /state\.data\.payment_methods/);
  assert.match(page, /api\.createOrder/);
  assert.match(page, /api\.submitProof/);
  assert.doesNotMatch(page, /\b\d{8,20}\b/);
});

test("credit SQL enforces idempotency and server-only execution", () => {
  const source = read("supabase/migrations/20260730090000_studio_ai_ccp_packs.sql");
  assert.match(source, /idempotency_key uuid not null unique/);
  assert.match(source, /on conflict\s*\(idempotency_key\)\s*do nothing/i);
  assert.match(source, /revoke all on function public\.studio_admin_approve[\s\S]*from public,anon,authenticated/i);
  assert.match(source, /grant execute on function public\.studio_admin_approve[\s\S]*to service_role/i);
});


test("Studio client and admin refresh Supabase automatically", () => {
  const client = read("studio-packs/app.js");
  const admin = read("studio-admin/app.js");
  for (const source of [client, admin]) {
    assert.match(source, /setInterval/);
    assert.match(source, /8000/);
    assert.match(source, /visibilitychange/);
    assert.match(source, /cache:\s*"no-store"/);
  }
});
