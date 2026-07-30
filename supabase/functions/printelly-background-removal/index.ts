import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const ALLOWED_ORIGINS = new Set([
  "https://farestoulouse665-del.github.io",
  "http://localhost:8080",
  "http://127.0.0.1:8080",
]);
const PHOTOROOM_SEGMENT_URL = "https://sdk.photoroom.com/v1/segment";
const MAX_EDGE_FILE_BYTES = 50 * 1024 * 1024;
const EXPOSED_HEADERS = [
  "x-request-id","x-image-width","x-image-height","x-processing-ms","x-model-name",
  "x-effective-mode","x-source-alpha-preserved","x-warnings","x-credits-available",
  "x-credits-reserved","x-studio-job-id"
].join(", ");

type JsonRecord = Record<string, unknown>;

function cors(origin: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-idempotency-key",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Expose-Headers": EXPOSED_HEADERS,
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function json(origin: string, status: number, body: unknown, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(origin), "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...extra },
  });
}

function requestOrigin(req: Request): string | null {
  const origin = req.headers.get("origin") || "";
  return ALLOWED_ORIGINS.has(origin) ? origin : null;
}

function bearer(req: Request): string {
  return (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
}

function uuidOrNew(value: string | null): string {
  const candidate = String(value || "");
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(candidate)
    ? candidate
    : crypto.randomUUID();
}

async function authenticatedUser(req: Request): Promise<string> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const token = bearer(req);
  if (!token || !supabaseUrl || !serviceKey) throw new Error("session_required");
  const response = await fetch(supabaseUrl + "/auth/v1/user", {
    headers: { "apikey": serviceKey, "Authorization": "Bearer " + token },
  });
  if (!response.ok) throw new Error("session_invalid");
  const user = await response.json();
  if (!user?.id) throw new Error("session_invalid");
  return String(user.id);
}

async function service(path: string, init: RequestInit = {}): Promise<unknown> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const response = await fetch(supabaseUrl + path, {
    ...init,
    headers: {
      "apikey": serviceKey,
      "Authorization": "Bearer " + serviceKey,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers || {}),
    },
  });
  const raw = await response.text();
  let body: unknown = null;
  if (raw) {
    try { body = JSON.parse(raw); } catch { body = raw; }
  }
  if (!response.ok) {
    const candidate = body as JsonRecord | null;
    throw new Error(String(candidate?.message || candidate?.details || body || "database_error"));
  }
  return body;
}

async function rpc(name: string, body: JsonRecord): Promise<JsonRecord> {
  return await service("/rest/v1/rpc/" + name, { method: "POST", body: JSON.stringify(body) }) as JsonRecord;
}

async function account(userId: string): Promise<JsonRecord> {
  return await rpc("studio_entitlement_status", { p_user_id: userId });
}

function mapAccessError(error: unknown): { status: number; detail: string; code: string } {
  const raw = error instanceof Error ? error.message : String(error);
  const entries: Array<[string, number, string]> = [
    ["session_required",401,"Connectez-vous à votre espace PRINTELLY."],
    ["session_invalid",401,"Votre session PRINTELLY a expiré."],
    ["trial_exhausted",402,"Votre essai gratuit est terminé. Choisissez un pack Studio AI pour continuer."],
    ["trial_disabled",402,"L’essai gratuit n’est pas disponible. Choisissez un pack Studio AI."],
    ["active_pack_required",402,"Aucun pack Studio IA actif. Choisissez un pack avant de continuer."],
    ["credit_required",402,"Vous n’avez plus de crédits Studio IA."],
    ["credit_batch_required",402,"Aucun crédit valide n’est disponible."],
    ["file_too_large_for_plan",413,"Cette image dépasse la taille autorisée par votre accès Studio AI."],
    ["resolution_too_large_for_plan",413,"Cette image dépasse la résolution autorisée par votre accès Studio AI."],
    ["format_not_allowed",415,"Ce format n’est pas autorisé par Studio IA."],
    ["batch_not_allowed",403,"Votre accès n’autorise pas le traitement par lots."],
    ["batch_limit_exceeded",403,"Ce lot dépasse la limite de votre accès."],
    ["concurrency_limit_reached",429,"La limite de traitements simultanés est atteinte."],
  ];
  for (const [key,status,detail] of entries) if (raw.includes(key)) return { status, detail, code: key };
  return { status: 503, detail: "Le contrôle de votre accès Studio IA est momentanément indisponible.", code: "entitlement_unavailable" };
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function consumeRateLimit(req: Request, subject: string): Promise<boolean> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return false;
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown";
  const configured = Number(Deno.env.get("PHOTOROOM_HOURLY_LIMIT") || "20");
  const limit = Number.isFinite(configured) ? Math.max(1, Math.min(200, Math.floor(configured))) : 20;
  const keyHash = await sha256("studio-background-removal|" + subject + "|" + ip);
  const response = await fetch(supabaseUrl + "/rest/v1/rpc/consume_web_signup_attempt", {
    method: "POST",
    headers: { "apikey": serviceKey, "Authorization": "Bearer " + serviceKey, "Content-Type": "application/json" },
    body: JSON.stringify({ p_key_hash: keyHash, p_limit: limit }),
  });
  if (!response.ok) return false;
  return (await response.json().catch(() => false)) === true;
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = 120000): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetch(url, { ...init, signal: controller.signal }); }
  finally { clearTimeout(timeout); }
}

function detectedMime(bytes: Uint8Array): "image/png" | "image/jpeg" | "image/webp" | null {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
      bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0,4)) === "RIFF" &&
      String.fromCharCode(...bytes.slice(8,12)) === "WEBP") return "image/webp";
  return null;
}

function pngSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (detectedMime(bytes) !== "image/png" || bytes.length < 24) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16, false);
  const height = view.getUint32(20, false);
  return width > 0 && height > 0 ? { width, height } : null;
}

function jpegSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (detectedMime(bytes) !== "image/jpeg") return null;
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) { offset += 1; continue; }
    const marker = bytes[offset + 1];
    if (marker === 0xd8 || marker === 0xd9) { offset += 2; continue; }
    if (offset + 4 > bytes.length) break;
    const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
    if (length < 2 || offset + 2 + length > bytes.length) break;
    if ([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)) {
      const height = (bytes[offset + 5] << 8) | bytes[offset + 6];
      const width = (bytes[offset + 7] << 8) | bytes[offset + 8];
      return width > 0 && height > 0 ? { width, height } : null;
    }
    offset += 2 + length;
  }
  return null;
}

function little24(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function webpSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (detectedMime(bytes) !== "image/webp" || bytes.length < 30) return null;
  const chunk = String.fromCharCode(...bytes.slice(12,16));
  if (chunk === "VP8X") return { width: little24(bytes,24)+1, height: little24(bytes,27)+1 };
  if (chunk === "VP8L" && bytes[20] === 0x2f) {
    const b1=bytes[21],b2=bytes[22],b3=bytes[23],b4=bytes[24];
    return { width: 1 + b1 + ((b2 & 0x3f) << 8), height: 1 + (b2 >> 6) + (b3 << 2) + ((b4 & 0x0f) << 10) };
  }
  if (chunk === "VP8 " && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
    return { width: (bytes[26] | (bytes[27] << 8)) & 0x3fff, height: (bytes[28] | (bytes[29] << 8)) & 0x3fff };
  }
  return null;
}

function imageSize(bytes: Uint8Array, mime: string): { width: number; height: number } | null {
  if (mime === "image/png") return pngSize(bytes);
  if (mime === "image/jpeg") return jpegSize(bytes);
  if (mime === "image/webp") return webpSize(bytes);
  return null;
}

function photoRoomError(status: number): string {
  if (status === 400) return "PhotoRoom a refusé ce fichier.";
  if (status === 401) return "La clé PhotoRoom est invalide.";
  if (status === 402) return "Le crédit fournisseur PhotoRoom est épuisé.";
  if (status === 403) return "PhotoRoom n’autorise pas cette opération.";
  if (status === 413) return "L’image dépasse la limite PhotoRoom.";
  if (status === 429) return "La limite PhotoRoom est atteinte. Réessayez plus tard.";
  if (status >= 500) return "PhotoRoom est temporairement indisponible.";
  return "PhotoRoom a refusé le traitement.";
}

Deno.serve(async (req: Request) => {
  const origin = requestOrigin(req);
  if (!origin) return new Response("Origin not allowed", { status: 403 });
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });

  let userId: string;
  try { userId = await authenticatedUser(req); }
  catch (error) {
    const mapped = mapAccessError(error);
    return json(origin, mapped.status, { detail: mapped.detail, code: mapped.code });
  }

  const apiKey = Deno.env.get("PHOTOROOM_API_KEY");
  if (!apiKey) return json(origin, 503, { detail: "PhotoRoom n’est pas configuré." });

  if (req.method === "GET") {
    try {
      const studio = await account(userId);
      const subscription = studio.subscription as JsonRecord | null;
      const plan = (studio.plan || {}) as JsonRecord;
      return json(origin, 200, {
        status: studio.access_allowed ? "ready" : "pack_required",
        model_loaded: true,
        device: "cloud",
        model_name: "PhotoRoom Remove Background API",
        provider: "photoroom",
        privacy: "La clé reste dans Supabase. L’image est transmise à PhotoRoom uniquement pour le détourage.",
        entitlement: {
          access_allowed: Boolean(studio.access_allowed),
          access_reason: String(studio.access_reason || "trial_exhausted"),
          trial_available: Number(studio.trial_available || 0),
          trial_consumed: Number(studio.trial_consumed || 0),
          trial_granted: Boolean(studio.trial_granted),
          paid_available: Number(studio.paid_available || 0),
          subscription_active: Boolean(subscription),
        },
        quota: {
          available: Number(studio.available || 0),
          reserved: Number(studio.reserved || 0),
          plan: String(plan.name || (studio.access_reason === "trial_available" ? "Essai gratuit" : subscription ? "Studio IA" : "Aucun pack actif")),
          expires_at: subscription?.expires_at || null,
          access_allowed: Boolean(studio.access_allowed),
          access_reason: String(studio.access_reason || "trial_exhausted"),
          trial_available: Number(studio.trial_available || 0),
          paid_available: Number(studio.paid_available || 0),
        },
      });
    } catch {
      return json(origin, 503, { detail: "Le solde Studio IA est indisponible." });
    }
  }

  if (req.method !== "POST") return json(origin, 405, { detail: "Méthode non autorisée." });
  const declaredLength = Number(req.headers.get("content-length") || "0");
  if (declaredLength > MAX_EDGE_FILE_BYTES) return json(origin, 413, { detail: "Fichier trop volumineux." });
  if (!(await consumeRateLimit(req, userId))) return json(origin, 429, { detail: "Limite horaire de sécurité atteinte." });

  let incoming: FormData;
  try { incoming = await req.formData(); }
  catch { return json(origin, 400, { detail: "Formulaire d’image invalide." }); }
  const image = incoming.get("image");
  if (!(image instanceof File)) return json(origin, 400, { detail: "Image absente." });
  if (image.size < 16 || image.size > MAX_EDGE_FILE_BYTES) return json(origin, 413, { detail: "Taille du fichier invalide." });

  const sourceBytes = new Uint8Array(await image.arrayBuffer());
  const realMime = detectedMime(sourceBytes);
  if (!realMime) return json(origin, 415, { detail: "Format réel non accepté. Utilisez PNG, JPEG ou WebP." });
  if (image.type && image.type !== realMime && !(image.type === "image/jpg" && realMime === "image/jpeg")) {
    return json(origin, 415, { detail: "Le contenu du fichier ne correspond pas à son type déclaré." });
  }
  const sourceSize = imageSize(sourceBytes, realMime);
  if (!sourceSize) return json(origin, 415, { detail: "Les dimensions réelles de cette image sont illisibles." });

  const requestId = uuidOrNew(req.headers.get("x-idempotency-key"));
  let reservation: JsonRecord;
  try {
    reservation = await rpc("studio_reserve_credit", {
      p_user_id: userId,
      p_request_key: requestId,
      p_mime_type: realMime,
      p_file_size_bytes: image.size,
      p_width: sourceSize.width,
      p_height: sourceSize.height,
      p_batch_count: 1,
    });
  } catch (error) {
    const mapped = mapAccessError(error);
    return json(origin, mapped.status, { detail: mapped.detail, code: mapped.code, request_id: requestId }, { "x-request-id": requestId });
  }

  const jobId = String(reservation.job_id || "");
  if (!jobId) return json(origin, 503, { detail: "La réservation du crédit a échoué.", request_id: requestId });
  await rpc("studio_mark_job_processing", { p_user_id: userId, p_job_id: jobId }).catch(() => undefined);

  const startedAt = performance.now();
  const outgoing = new FormData();
  outgoing.append("image_file", new Blob([sourceBytes], { type: realMime }), image.name || "printelly-image");
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
      const refunded = await rpc("studio_finalize_credit", {
        p_user_id: userId,p_job_id: jobId,p_success: false,p_provider_request_id: "",p_failure_code: "photoroom_" + result.status,
      }).catch(() => ({})) as JsonRecord;
      return json(origin, result.status, {
        detail: photoRoomError(result.status), request_id: requestId, credit_refunded: true,
      }, {
        "x-request-id": requestId,
        "x-credits-available": String(refunded.available_credits ?? reservation.available_credits ?? 0),
        "x-credits-reserved": String(refunded.reserved_credits ?? 0),
        "x-studio-job-id": jobId,
      });
    }

    const resultBytes = new Uint8Array(await result.arrayBuffer());
    const size = pngSize(resultBytes);
    if (!size || size.width !== sourceSize.width || size.height !== sourceSize.height) {
      const refunded = await rpc("studio_finalize_credit", {
        p_user_id: userId,p_job_id: jobId,p_success: false,p_provider_request_id: "",p_failure_code: "invalid_result",
      }).catch(() => ({})) as JsonRecord;
      return json(origin, 502, {
        detail: "PhotoRoom n’a pas retourné un PNG transparent valide dans les dimensions originales.",
        request_id: requestId, credit_refunded: true,
      }, {
        "x-request-id": requestId,
        "x-credits-available": String(refunded.available_credits ?? reservation.available_credits ?? 0),
        "x-credits-reserved": String(refunded.reserved_credits ?? 0),
        "x-studio-job-id": jobId,
      });
    }

    const providerRequestId = result.headers.get("x-request-id") || requestId;
    const finalized = await rpc("studio_finalize_credit", {
      p_user_id: userId,p_job_id: jobId,p_success: true,p_provider_request_id: providerRequestId,p_failure_code: "",
    });
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
        "x-credits-available": String(finalized.available_credits ?? 0),
        "x-credits-reserved": String(finalized.reserved_credits ?? 0),
        "x-studio-job-id": jobId,
      },
    });
  } catch (error) {
    const refunded = await rpc("studio_finalize_credit", {
      p_user_id: userId,p_job_id: jobId,p_success: false,p_provider_request_id: "",p_failure_code: "network_or_timeout",
    }).catch(() => ({})) as JsonRecord;
    const detail = error instanceof DOMException && error.name === "AbortError"
      ? "PhotoRoom n’a pas répondu avant le délai autorisé. Votre crédit a été restitué."
      : "Connexion sécurisée à PhotoRoom impossible. Votre crédit a été restitué.";
    return json(origin, 504, { detail, request_id: requestId, credit_refunded: true }, {
      "x-request-id": requestId,
      "x-credits-available": String(refunded.available_credits ?? reservation.available_credits ?? 0),
      "x-credits-reserved": String(refunded.reserved_credits ?? 0),
      "x-studio-job-id": jobId,
    });
  }
});