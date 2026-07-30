import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const ALLOWED_ORIGINS = new Set([
  "https://farestoulouse665-del.github.io",
  "http://localhost:8080",
  "http://127.0.0.1:8080",
]);
const PHOTOROOM_SEGMENT_URL = "https://sdk.photoroom.com/v1/segment";
const PHOTOROOM_ACCOUNT_URL = "https://image-api.photoroom.com/v2/account";
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const EXPOSED_HEADERS = [
  "x-request-id",
  "x-image-width",
  "x-image-height",
  "x-processing-ms",
  "x-model-name",
  "x-effective-mode",
  "x-source-alpha-preserved",
  "x-warnings",
].join(", ");

function cors(origin: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Expose-Headers": EXPOSED_HEADERS,
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function json(origin: string, status: number, body: unknown, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(origin), "Content-Type": "application/json; charset=utf-8", ...extra },
  });
}

function requestOrigin(req: Request): string | null {
  const origin = req.headers.get("origin") || "";
  return ALLOWED_ORIGINS.has(origin) ? origin : null;
}

function sessionSubject(req: Request): string | null {
  const authorization = req.headers.get("authorization") || "";
  const token = authorization.replace(/^Bearer\s+/i, "");
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    const normalized = part.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
    const payload = JSON.parse(atob(padded));
    return typeof payload.sub === "string" && payload.sub ? payload.sub : null;
  } catch {
    return null;
  }
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function consumeRateLimit(req: Request, subject: string): Promise<boolean> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return false;
  const forwarded = req.headers.get("x-forwarded-for") || "";
  const ip = forwarded.split(",")[0].trim() || "unknown";
  const configured = Number(Deno.env.get("PHOTOROOM_HOURLY_LIMIT") || "5");
  const limit = Number.isFinite(configured) ? Math.max(1, Math.min(50, Math.floor(configured))) : 5;
  const keyHash = await sha256("background-removal|" + subject + "|" + ip);
  const response = await fetch(supabaseUrl + "/rest/v1/rpc/consume_web_signup_attempt", {
    method: "POST",
    headers: {
      "apikey": serviceKey,
      "Authorization": "Bearer " + serviceKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ p_key_hash: keyHash, p_limit: limit }),
  });
  if (!response.ok) return false;
  return (await response.json().catch(() => false)) === true;
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = 120000): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function detectedMime(head: Uint8Array): string | null {
  if (
    head.length >= 8 &&
    head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47 &&
    head[4] === 0x0d && head[5] === 0x0a && head[6] === 0x1a && head[7] === 0x0a
  ) return "image/png";
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    head.length >= 12 &&
    String.fromCharCode(...head.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...head.slice(8, 12)) === "WEBP"
  ) return "image/webp";
  return null;
}

function pngSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (detectedMime(bytes.slice(0, 12)) !== "image/png" || bytes.length < 24) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16, false);
  const height = view.getUint32(20, false);
  return width > 0 && height > 0 ? { width, height } : null;
}

function photoRoomError(status: number): string {
  if (status === 400) return "PhotoRoom a refusé ce fichier.";
  if (status === 401) return "La clé PhotoRoom est invalide ou le crédit est épuisé.";
  if (status === 402) return "Le crédit PhotoRoom est épuisé.";
  if (status === 403) return "Votre compte PhotoRoom n’autorise pas cette opération.";
  if (status === 413) return "L’image dépasse la limite PhotoRoom.";
  if (status === 429) return "La limite PhotoRoom est atteinte. Réessayez plus tard.";
  if (status >= 500) return "PhotoRoom est temporairement indisponible.";
  return "PhotoRoom a refusé le traitement.";
}

Deno.serve(async (req: Request) => {
  const origin = requestOrigin(req);
  if (!origin) return new Response("Origin not allowed", { status: 403 });
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });

  const subject = sessionSubject(req);
  if (!subject) return json(origin, 401, { detail: "Session PRINTELLY requise." });

  const apiKey = Deno.env.get("PHOTOROOM_API_KEY");
  if (!apiKey) {
    return json(origin, 503, { detail: "PHOTOROOM_API_KEY est absente des secrets Supabase." });
  }

  if (req.method === "GET") {
    try {
      const account = await fetchWithTimeout(PHOTOROOM_ACCOUNT_URL, {
        method: "GET",
        headers: { "x-api-key": apiKey, "accept": "application/json" },
      }, 15000);
      if (!account.ok) return json(origin, account.status, { detail: photoRoomError(account.status) });
      const usage = await account.json().catch(() => ({}));
      return json(origin, 200, {
        status: "ready",
        model_loaded: true,
        device: "cloud",
        model_name: "PhotoRoom Remove Background API",
        provider: "photoroom",
        privacy: "La clé reste dans Supabase. L’image est transmise à PhotoRoom uniquement pour le détourage.",
        quota: {
          available: Number(usage?.images?.available ?? 0),
          subscription: Number(usage?.images?.subscription ?? 0),
          plan: String(usage?.plan || "unknown"),
        },
      });
    } catch {
      return json(origin, 503, { detail: "Connexion sécurisée à PhotoRoom impossible." });
    }
  }

  if (req.method !== "POST") return json(origin, 405, { detail: "Méthode non autorisée." });

  const declaredLength = Number(req.headers.get("content-length") || "0");
  if (declaredLength > MAX_FILE_BYTES + 1024 * 256) {
    return json(origin, 413, { detail: "Fichier trop volumineux. Limite publique : 10 Mo." });
  }

  if (!(await consumeRateLimit(req, subject))) {
    return json(origin, 429, { detail: "Limite de détourage atteinte pour cette heure." });
  }

  let incoming: FormData;
  try {
    incoming = await req.formData();
  } catch {
    return json(origin, 400, { detail: "Formulaire d’image invalide." });
  }
  const image = incoming.get("image");
  if (!(image instanceof File)) return json(origin, 400, { detail: "Image absente." });
  if (image.size < 16 || image.size > MAX_FILE_BYTES) {
    return json(origin, 413, { detail: "Le fichier doit mesurer moins de 10 Mo." });
  }

  const head = new Uint8Array(await image.slice(0, 12).arrayBuffer());
  const realMime = detectedMime(head);
  if (!realMime || !["image/png", "image/jpeg", "image/webp"].includes(realMime)) {
    return json(origin, 415, { detail: "Format réel non accepté. Utilisez PNG, JPEG ou WebP." });
  }
  if (image.type && image.type !== realMime && !(image.type === "image/jpg" && realMime === "image/jpeg")) {
    return json(origin, 415, { detail: "Le contenu du fichier ne correspond pas à son type déclaré." });
  }

  const requestId = crypto.randomUUID();
  const startedAt = performance.now();
  const outgoing = new FormData();
  outgoing.append("image_file", image, image.name || "printelly-image");
  outgoing.append("format", "png");
  outgoing.append("channels", "rgba");
  outgoing.append("size", "full");

  try {
    const result = await fetchWithTimeout(PHOTOROOM_SEGMENT_URL, {
      method: "POST",
      headers: { "x-api-key": apiKey, "accept": "image/png" },
      body: outgoing,
    });
    if (!result.ok) {
      return json(origin, result.status, { detail: photoRoomError(result.status), request_id: requestId }, {
        "x-request-id": requestId,
      });
    }
    const resultBytes = new Uint8Array(await result.arrayBuffer());
    const size = pngSize(resultBytes);
    if (!size) {
      return json(origin, 502, { detail: "PhotoRoom n’a pas retourné un PNG transparent valide.", request_id: requestId });
    }
    const elapsed = Math.max(0, Math.round(performance.now() - startedAt));
    return new Response(resultBytes, {
      status: 200,
      headers: {
        ...cors(origin),
        "Content-Type": "image/png",
        "Cache-Control": "no-store",
        "Content-Disposition": 'attachment; filename="printelly-sans-fond.png"',
        "x-request-id": requestId,
        "x-image-width": String(size.width),
        "x-image-height": String(size.height),
        "x-processing-ms": String(elapsed),
        "x-model-name": "PhotoRoom Remove Background",
        "x-effective-mode": "auto",
        "x-source-alpha-preserved": "false",
        "x-warnings": "[]",
      },
    });
  } catch (error) {
    const message = error instanceof DOMException && error.name === "AbortError"
      ? "PhotoRoom n’a pas répondu avant le délai autorisé."
      : "Connexion sécurisée à PhotoRoom impossible.";
    return json(origin, 504, { detail: message, request_id: requestId }, { "x-request-id": requestId });
  }
});