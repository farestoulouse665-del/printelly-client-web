import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const editor = await readFile(new URL("../../background-remover.js", import.meta.url), "utf8");
const html = await readFile(new URL("../../index.html", import.meta.url), "utf8");
const compose = await readFile(new URL("../../docker-compose.yml", import.meta.url), "utf8");
const nginx = await readFile(new URL("../../docker/nginx.conf", import.meta.url), "utf8");
const config = await readFile(new URL("../../backend/app/core/config.py", import.meta.url), "utf8");
const envExample = await readFile(new URL("../../.env.example", import.meta.url), "utf8");

test("large PNG uploads use one consistent 50 MB limit", () => {
  assert.match(editor, /file\.size > 50 \* 1024 \* 1024/);
  assert.match(editor, /limite de 50 Mo/);
  assert.match(html, /PNG, JPEG ou WebP • 50 Mo • 40 mégapixels/);
  assert.match(config, /_int\("MAX_UPLOAD_MB", 50\)/);
  assert.match(compose, /MAX_UPLOAD_MB: \$\{MAX_UPLOAD_MB:-50\}/);
  assert.match(envExample, /^MAX_UPLOAD_MB=50$/m);
});

test("large decoded PNGs have adequate timeout and temporary memory", () => {
  assert.match(config, /_int\("REQUEST_TIMEOUT_SECONDS", 300\)/);
  assert.match(compose, /REQUEST_TIMEOUT_SECONDS: \$\{REQUEST_TIMEOUT_SECONDS:-300\}/);
  assert.match(compose, /background-removal:size=512m/);
  assert.match(nginx, /client_max_body_size 52m/);
  assert.match(nginx, /proxy_read_timeout 310s/);
  assert.match(nginx, /proxy_send_timeout 310s/);
  assert.match(envExample, /^REQUEST_TIMEOUT_SECONDS=300$/m);
});
