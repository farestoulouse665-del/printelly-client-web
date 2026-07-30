import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const ALLOWED_ORIGINS = new Set([
  "https://farestoulouse665-del.github.io",
  "http://localhost:8080",
  "http://127.0.0.1:8080",
]);
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const PROOF_BUCKET = "studio-payment-proofs";
const MAX_EDGE_PROOF_BYTES = 50 * 1024 * 1024;
const ADMIN_ROLES = new Set(["admin", "administrator", "superadmin"]);

type JsonRecord = Record<string, unknown>;

function cors(origin: string): HeadersInit {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-idempotency-key",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function json(origin: string, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(origin), "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function originFor(req: Request): string | null {
  const origin = req.headers.get("origin") || "";
  return ALLOWED_ORIGINS.has(origin) ? origin : null;
}

function bearer(req: Request): string {
  return (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
}

async function service(path: string, init: RequestInit = {}): Promise<unknown> {
  const response = await fetch(SUPABASE_URL + path, {
    ...init,
    headers: {
      "apikey": SERVICE_KEY,
      "Authorization": "Bearer " + SERVICE_KEY,
      ...(init.body && !(init.body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
      ...(init.headers || {}),
    },
  });
  const text = await response.text();
  let body: unknown = null;
  if (text) {
    try { body = JSON.parse(text); } catch { body = text; }
  }
  if (!response.ok) {
    const candidate = body as JsonRecord | null;
    const detail = candidate?.message || candidate?.details || candidate?.hint || body || "Erreur Supabase " + response.status;
    throw new Error(String(detail));
  }
  return body;
}

async function rpc(name: string, body: JsonRecord): Promise<unknown> {
  return service("/rest/v1/rpc/" + name, {
    method: "POST",
    headers: { "Prefer": "return=representation" },
    body: JSON.stringify(body),
  });
}

async function authenticatedUser(req: Request): Promise<{ id: string; email?: string }> {
  const token = bearer(req);
  if (!token) throw new Error("session_required");
  const response = await fetch(SUPABASE_URL + "/auth/v1/user", {
    headers: { "apikey": SERVICE_KEY, "Authorization": "Bearer " + token },
  });
  if (!response.ok) throw new Error("session_invalid");
  const user = await response.json();
  if (!user?.id) throw new Error("session_invalid");
  return { id: String(user.id), email: typeof user.email === "string" ? user.email : undefined };
}

async function profile(userId: string): Promise<JsonRecord> {
  const rows = await service("/rest/v1/profiles?select=id,role,full_name,first_name,last_name,phone,email,client_email&id=eq." + encodeURIComponent(userId)) as JsonRecord[];
  return rows?.[0] || { id: userId, role: "client" };
}

function isAdmin(profileRow: JsonRecord): boolean {
  return ADMIN_ROLES.has(String(profileRow.role || "").toLowerCase());
}

function messageFor(error: unknown): { status: number; detail: string } {
  const raw = error instanceof Error ? error.message : String(error);
  const messages: Record<string, [number, string]> = {
    session_required: [401, "Connectez-vous à votre compte PRINTELLY."],
    session_invalid: [401, "Votre session a expiré. Reconnectez-vous."],
    admin_required: [403, "Accès administrateur requis."],
    plan_unavailable: [409, "Ce pack n’est plus disponible. Actualisez la page."],
    payment_method_unavailable: [409, "Le paiement CCP est actuellement indisponible."],
    order_not_found: [404, "Commande introuvable."],
    order_expired: [409, "Cette commande a expiré. Créez une nouvelle commande."],
    proof_not_allowed: [409, "Une preuve ne peut pas être ajoutée dans l’état actuel."],
    proof_already_used: [409, "Ce justificatif a déjà été utilisé pour une autre commande."],
    proof_required: [409, "Une preuve de paiement est obligatoire."],
    revision_conflict: [409, "La demande a été modifiée. Actualisez avant de continuer."],
    approval_not_allowed: [409, "Cette demande ne peut pas être approuvée dans son état actuel."],
    terminal_order: [409, "Cette commande est déjà terminée."],
    active_pack_required: [402, "Un pack Studio IA actif est nécessaire."],
    credit_required: [402, "Vous n’avez plus de crédits Studio IA."],
    credit_batch_required: [402, "Aucun crédit valide n’est disponible."],
    file_too_large_for_plan: [413, "Cette image dépasse la taille autorisée par votre pack."],
    resolution_too_large_for_plan: [413, "Cette image dépasse la résolution autorisée par votre pack."],
    format_not_allowed: [415, "Ce format n’est pas autorisé."],
    batch_not_allowed: [403, "Votre pack n’autorise pas le traitement par lots."],
    batch_limit_exceeded: [403, "Ce lot dépasse la limite de votre pack."],
    concurrency_limit_reached: [429, "La limite de traitements simultanés de votre pack est atteinte."],
  };
  for (const [key, value] of Object.entries(messages)) {
    if (raw.includes(key)) return { status: value[0], detail: value[1] };
  }
  return { status: 500, detail: "Une erreur sécurisée est survenue. Réessayez." };
}

function uuid(value: unknown): string {
  const text = String(value || "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)) {
    throw new Error("Identifiant invalide.");
  }
  return text;
}

function numeric(value: unknown, min: number, max: number, fallback?: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    if (fallback !== undefined) return fallback;
    throw new Error("Valeur numérique invalide.");
  }
  if (parsed < min || parsed > max) throw new Error("Valeur hors limite.");
  return parsed;
}

function text(value: unknown, max: number, required = false): string {
  const result = String(value || "").trim();
  if (required && !result) throw new Error("Champ obligatoire manquant.");
  return result.slice(0, max);
}

function bool(value: unknown): boolean {
  return value === true || value === "true" || value === 1 || value === "1";
}

function realMime(head: Uint8Array): "image/jpeg" | "image/png" | "application/pdf" | null {
  if (head.length >= 8 && head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47 &&
      head[4] === 0x0d && head[5] === 0x0a && head[6] === 0x1a && head[7] === 0x0a) return "image/png";
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return "image/jpeg";
  if (head.length >= 5 && String.fromCharCode(...head.slice(0, 5)) === "%PDF-") return "application/pdf";
  return null;
}

async function digestHex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function safeFileName(name: string): string {
  return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^[._-]+|[._-]+$/g, "").slice(0, 100) || "preuve";
}

function extensionFor(mime: string): string {
  return mime === "application/pdf" ? "pdf" : mime === "image/png" ? "png" : "jpg";
}

function clientIp(req: Request): string | null {
  const candidate = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim();
  return candidate && candidate.length <= 64 ? candidate : null;
}

async function activeCatalog(): Promise<{ plans: JsonRecord[]; payment_methods: JsonRecord[] }> {
  const now = Date.now();
  const plans = await service(
    "/rest/v1/studio_plans?select=id,slug,name,description,price_dzd,included_credits,background_removals,validity_days,quality,max_file_size_bytes,max_image_side,concurrent_jobs,batch_allowed,max_batch_images,retention_days,features,badge,starts_at,ends_at,sales_limit,sold_count,display_order&active=eq.true&available_for_sale=eq.true&archived=eq.false&order=display_order.asc,price_dzd.asc"
  ) as JsonRecord[];
  const filtered = (plans || []).filter((plan) => {
    const start = plan.starts_at ? new Date(String(plan.starts_at)).getTime() : 0;
    const end = plan.ends_at ? new Date(String(plan.ends_at)).getTime() : Infinity;
    const stock = plan.sales_limit == null || Number(plan.sold_count || 0) < Number(plan.sales_limit);
    return start <= now && end > now && stock;
  });
  const methods = await service(
    "/rest/v1/studio_payment_methods?select=id,method_type,label,account_holder,ccp_number,ccp_key,rip,baridimob_number,instructions,proof_deadline_hours,average_validation_hours,max_proof_bytes&active=eq.true&order=display_order.asc"
  ) as JsonRecord[];
  return { plans: filtered, payment_methods: methods || [] };
}

async function dashboard(userId: string): Promise<JsonRecord> {
  const [catalog, entitlement, walletRows, subscriptions, orders, transactions, notifications, jobs, creditBatches] = await Promise.all([
    activeCatalog(),
    rpc("studio_entitlement_status", { p_user_id: userId }),
    service("/rest/v1/studio_credit_wallets?select=available_credits,reserved_credits,consumed_credits,expired_credits,revision,updated_at&user_id=eq." + userId),
    service("/rest/v1/studio_subscriptions?select=id,plan_id,source_order_id,plan_snapshot,status,starts_at,expires_at,activated_at,created_at&user_id=eq." + userId + "&order=created_at.desc&limit=20"),
    service("/rest/v1/studio_orders?select=id,reference,plan_id,plan_snapshot,expected_amount_dzd,currency,status,proof_deadline_at,expires_at,declared_amount_dzd,receipt_reference,payer_name,payer_phone,payment_date,payment_channel,review_note,rejection_reason,revision,approved_at,receipt_number,created_at,updated_at&user_id=eq." + userId + "&order=created_at.desc&limit=50"),
    service("/rest/v1/studio_credit_transactions?select=id,operation,amount,available_balance_after,reserved_balance_after,reason,metadata,created_at&user_id=eq." + userId + "&order=created_at.desc&limit=100"),
    service("/rest/v1/studio_notifications?select=id,notification_type,title,message,data,read_at,created_at&user_id=eq." + userId + "&order=created_at.desc&limit=50"),
    service("/rest/v1/studio_image_jobs?select=id,status,credit_source,mime_type,file_size_bytes,width,height,cost_dzd,failure_code,created_at,completed_at&user_id=eq." + userId + "&order=created_at.desc&limit=100"),
    service("/rest/v1/studio_credit_batches?select=id,source,original_credits,remaining_credits,reserved_credits,expires_at,status,created_at&user_id=eq." + userId + "&order=created_at.desc&limit=50"),
  ]);
  return {
    ...catalog,
    entitlement,
    wallet: (walletRows as JsonRecord[])?.[0] || { available_credits: 0, reserved_credits: 0, consumed_credits: 0, expired_credits: 0 },
    subscriptions,
    orders,
    transactions,
    notifications,
    jobs,
    credit_batches: creditBatches,
  };
}

async function adminDashboard(adminId: string): Promise<JsonRecord> {
  const adminProfile = await profile(adminId);
  if (!isAdmin(adminProfile)) throw new Error("admin_required");
  const [plans, methods, orders, proofs, subscriptions, settings, trialBatches, trialJobs] = await Promise.all([
    service("/rest/v1/studio_plans?select=*&order=display_order.asc,created_at.desc"),
    service("/rest/v1/studio_payment_methods?select=*&order=display_order.asc,created_at.desc"),
    service("/rest/v1/studio_orders?select=id,reference,user_id,plan_id,plan_snapshot,expected_amount_dzd,status,declared_amount_dzd,receipt_reference,payer_name,payer_phone,payment_date,payment_time,payment_channel,client_comment,review_note,rejection_reason,created_ip,user_agent,revision,approved_at,receipt_number,created_at,updated_at&order=created_at.desc&limit=200"),
    service("/rest/v1/studio_payment_proofs?select=id,order_id,user_id,original_name,mime_type,size_bytes,sha256,status,is_current,submitted_at,reviewed_at,review_note&is_current=eq.true&order=submitted_at.desc&limit=200"),
    service("/rest/v1/studio_subscriptions?select=id,user_id,plan_id,source_order_id,plan_snapshot,status,starts_at,expires_at,activated_at&order=created_at.desc&limit=200"),
    service("/rest/v1/studio_settings?select=key,value,updated_at&order=key.asc"),
    service("/rest/v1/studio_credit_batches?select=id,user_id,source,original_credits,remaining_credits,reserved_credits,expires_at,status,created_at&source=eq.free_trial&order=created_at.desc&limit=500"),
    service("/rest/v1/studio_image_jobs?select=id,user_id,credit_source,status,cost_dzd,created_at,completed_at&credit_source=eq.free_trial&order=created_at.desc&limit=1000"),
  ]);
  const orderList = orders as JsonRecord[];
  const ids = Array.from(new Set(orderList.map((order) => String(order.user_id || "")).filter(Boolean)));
  let profiles: JsonRecord[] = [];
  if (ids.length) {
    profiles = await service("/rest/v1/profiles?select=id,full_name,first_name,last_name,phone,email,client_email,role&id=in.(" + ids.join(",") + ")") as JsonRecord[];
  }
  const batches = trialBatches as JsonRecord[];
  const jobs = trialJobs as JsonRecord[];
  const trialStats = {
    granted: batches.length,
    available: batches.filter((batch) => Number(batch.remaining_credits || 0) > 0 && String(batch.status) === "active").length,
    consumed: jobs.filter((job) => String(job.status) === "succeeded").length,
    processing: jobs.filter((job) => ["reserved","processing"].includes(String(job.status))).length,
    refunded: jobs.filter((job) => String(job.status) === "refunded").length,
    cost_dzd: jobs.reduce((sum, job) => sum + Number(job.cost_dzd || 0), 0),
  };
  return {
    plans, payment_methods: methods, orders, proofs, subscriptions, settings, profiles,
    trial_batches: batches, trial_jobs: jobs, trial_stats: trialStats,
  };
}

async function createOrder(req: Request, userId: string, body: JsonRecord): Promise<unknown> {
  return rpc("studio_create_order", {
    p_user_id: userId,
    p_plan_id: uuid(body.plan_id),
    p_payment_method_id: uuid(body.payment_method_id),
    p_idempotency_key: uuid(body.idempotency_key),
    p_ip: clientIp(req),
    p_user_agent: text(req.headers.get("user-agent"), 500),
  });
}

async function uploadProof(req: Request, userId: string): Promise<unknown> {
  const form = await req.formData();
  const orderId = uuid(form.get("order_id"));
  const file = form.get("proof");
  if (!(file instanceof File)) throw new Error("Justificatif absent.");
  if (file.size < 16 || file.size > MAX_EDGE_PROOF_BYTES) throw new Error("Taille du justificatif invalide.");

  const orders = await service("/rest/v1/studio_orders?select=id,user_id,status,payment_method_id,expires_at&id=eq." + orderId + "&user_id=eq." + userId) as JsonRecord[];
  const order = orders?.[0];
  if (!order) throw new Error("order_not_found");
  const methods = await service("/rest/v1/studio_payment_methods?select=max_proof_bytes&id=eq." + order.payment_method_id) as JsonRecord[];
  const maxBytes = Number(methods?.[0]?.max_proof_bytes || 10 * 1024 * 1024);
  if (file.size > maxBytes) throw new Error("Le justificatif dépasse la limite autorisée.");

  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = realMime(bytes.slice(0, 12));
  if (!mime) throw new Error("Utilisez un véritable JPG, PNG ou PDF.");
  if (file.type && file.type !== mime && !(file.type === "image/jpg" && mime === "image/jpeg")) {
    throw new Error("Le contenu du fichier ne correspond pas à son type déclaré.");
  }
  const sha = await digestHex(bytes);
  const storagePath = userId + "/" + orderId + "/" + crypto.randomUUID() + "." + extensionFor(mime);
  const upload = await fetch(SUPABASE_URL + "/storage/v1/object/" + PROOF_BUCKET + "/" + storagePath, {
    method: "POST",
    headers: {
      "apikey": SERVICE_KEY,
      "Authorization": "Bearer " + SERVICE_KEY,
      "Content-Type": mime,
      "x-upsert": "false",
      "Cache-Control": "no-store",
    },
    body: bytes,
  });
  if (!upload.ok) throw new Error("Le justificatif n’a pas pu être stocké.");

  try {
    return await rpc("studio_submit_proof_record", {
      p_user_id: userId,
      p_order_id: orderId,
      p_storage_path: storagePath,
      p_original_name: safeFileName(file.name),
      p_mime_type: mime,
      p_size_bytes: file.size,
      p_sha256: sha,
      p_payer_name: text(form.get("payer_name"), 160, true),
      p_payer_phone: text(form.get("payer_phone"), 40, true),
      p_amount: numeric(form.get("amount_dzd"), 0, 100000000),
      p_payment_date: text(form.get("payment_date"), 10, true),
      p_payment_time: text(form.get("payment_time"), 8),
      p_receipt_reference: text(form.get("receipt_reference"), 120, true),
      p_payment_channel: text(form.get("payment_channel"), 60, true),
      p_comment: text(form.get("comment"), 1500),
    });
  } catch (error) {
    await fetch(SUPABASE_URL + "/storage/v1/object/" + PROOF_BUCKET + "/" + storagePath, {
      method: "DELETE",
      headers: { "apikey": SERVICE_KEY, "Authorization": "Bearer " + SERVICE_KEY },
    }).catch(() => undefined);
    throw error;
  }
}

function planPayload(body: JsonRecord, adminId: string): JsonRecord {
  const features = Array.isArray(body.features) ? body.features.map((item) => text(item, 120)).filter(Boolean).slice(0, 30) : [];
  const batchAllowed = bool(body.batch_allowed);
  return {
    slug: text(body.slug, 63, true).toLowerCase().replace(/[^a-z0-9-]+/g, "-"),
    name: text(body.name, 100, true),
    description: text(body.description, 1500),
    price_dzd: numeric(body.price_dzd, 0, 100000000),
    included_credits: Math.round(numeric(body.included_credits, 1, 1000000)),
    background_removals: Math.round(numeric(body.background_removals ?? body.included_credits, 1, 1000000)),
    validity_days: Math.round(numeric(body.validity_days, 1, 3660)),
    quality: text(body.quality, 80) || "HD",
    max_file_size_bytes: Math.round(numeric(body.max_file_size_bytes, 1024, 104857600)),
    max_image_side: Math.round(numeric(body.max_image_side, 256, 30000)),
    concurrent_jobs: Math.round(numeric(body.concurrent_jobs, 1, 20)),
    batch_allowed: batchAllowed,
    max_batch_images: batchAllowed ? Math.round(numeric(body.max_batch_images, 1, 100)) : 1,
    retention_days: Math.round(numeric(body.retention_days, 0, 3650, 0)),
    features,
    badge: text(body.badge, 80) || null,
    active: bool(body.active),
    available_for_sale: bool(body.available_for_sale),
    archived: bool(body.archived),
    display_order: Math.round(numeric(body.display_order, -10000, 10000, 0)),
    sales_limit: body.sales_limit === "" || body.sales_limit == null ? null : Math.round(numeric(body.sales_limit, 0, 1000000)),
    starts_at: body.starts_at || null,
    ends_at: body.ends_at || null,
    updated_by: adminId,
  };
}

async function savePlan(adminId: string, body: JsonRecord): Promise<unknown> {
  if (!isAdmin(await profile(adminId))) throw new Error("admin_required");
  const payload = planPayload(body, adminId);
  if (body.id) {
    return service("/rest/v1/studio_plans?id=eq." + uuid(body.id), {
      method: "PATCH",
      headers: { "Prefer": "return=representation" },
      body: JSON.stringify(payload),
    });
  }
  return service("/rest/v1/studio_plans", {
    method: "POST",
    headers: { "Prefer": "return=representation" },
    body: JSON.stringify({ ...payload, created_by: adminId }),
  });
}

async function savePaymentMethod(adminId: string, body: JsonRecord): Promise<unknown> {
  if (!isAdmin(await profile(adminId))) throw new Error("admin_required");
  const payload: JsonRecord = {
    method_type: ["ccp", "baridimob", "manual"].includes(String(body.method_type)) ? body.method_type : "ccp",
    label: text(body.label, 100, true),
    account_holder: text(body.account_holder, 160, true),
    ccp_number: text(body.ccp_number, 80) || null,
    ccp_key: text(body.ccp_key, 20) || null,
    rip: text(body.rip, 80) || null,
    baridimob_number: text(body.baridimob_number, 40) || null,
    instructions: text(body.instructions, 2000),
    proof_deadline_hours: Math.round(numeric(body.proof_deadline_hours, 1, 720)),
    average_validation_hours: Math.round(numeric(body.average_validation_hours, 1, 720)),
    max_proof_bytes: Math.round(numeric(body.max_proof_bytes, 1024, 52428800)),
    active: bool(body.active),
    display_order: Math.round(numeric(body.display_order, -10000, 10000, 0)),
    updated_by: adminId,
  };
  if (!payload.ccp_number && !payload.rip && !payload.baridimob_number) throw new Error("Ajoutez au moins un numéro CCP, RIP ou BaridiMob.");
  if (body.id) {
    return service("/rest/v1/studio_payment_methods?id=eq." + uuid(body.id), {
      method: "PATCH",
      headers: { "Prefer": "return=representation" },
      body: JSON.stringify(payload),
    });
  }
  return service("/rest/v1/studio_payment_methods", {
    method: "POST",
    headers: { "Prefer": "return=representation" },
    body: JSON.stringify({ ...payload, created_by: adminId }),
  });
}

async function saveSettings(adminId: string, body: JsonRecord): Promise<unknown> {
  if (!isAdmin(await profile(adminId))) throw new Error("admin_required");
  if (String(body.key || "") !== "free_trial") throw new Error("Paramètre Studio AI non autorisé.");
  const value = {
    enabled: bool(body.enabled),
    credits: Math.round(numeric(body.credits, 1, 10, 1)),
    quality: ["standard","HD","ultra"].includes(String(body.quality)) ? String(body.quality) : "HD",
    max_file_size_bytes: Math.round(numeric(body.max_file_size_bytes, 1048576, 52428800, 10485760)),
    max_image_side: Math.round(numeric(body.max_image_side, 512, 16000, 6000)),
    concurrent_jobs: Math.round(numeric(body.concurrent_jobs, 1, 4, 1)),
    batch_allowed: bool(body.batch_allowed),
    max_batch_images: Math.round(numeric(body.max_batch_images, 1, 25, 1)),
    validity_days: Math.round(numeric(body.validity_days, 1, 3650, 3650)),
  };
  return service("/rest/v1/studio_settings?on_conflict=key", {
    method: "POST",
    headers: { "Prefer": "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify({ key: "free_trial", value, updated_by: adminId, updated_at: new Date().toISOString() }),
  });
}

async function adminAction(adminId: string, body: JsonRecord): Promise<unknown> {
  if (!isAdmin(await profile(adminId))) throw new Error("admin_required");
  const action = String(body.admin_action || "");
  if (action === "approve") {
    return rpc("studio_admin_approve", {
      p_admin_id: adminId,
      p_order_id: uuid(body.order_id),
      p_expected_revision: Math.round(numeric(body.expected_revision, 0, Number.MAX_SAFE_INTEGER)),
      p_action_key: uuid(body.action_key),
      p_note: text(body.note, 2000),
    });
  }
  return rpc("studio_admin_transition", {
    p_admin_id: adminId,
    p_order_id: uuid(body.order_id),
    p_action: action,
    p_expected_revision: Math.round(numeric(body.expected_revision, 0, Number.MAX_SAFE_INTEGER)),
    p_action_key: uuid(body.action_key),
    p_reason: text(body.reason, 500),
    p_note: text(body.note, 2000),
  });
}

async function proofUrl(userId: string, body: JsonRecord): Promise<unknown> {
  const proofId = uuid(body.proof_id);
  const viewer = await profile(userId);
  const rows = await service("/rest/v1/studio_payment_proofs?select=id,user_id,storage_path,original_name&id=eq." + proofId) as JsonRecord[];
  const proof = rows?.[0];
  if (!proof || (String(proof.user_id) !== userId && !isAdmin(viewer))) throw new Error("Preuve introuvable.");
  const signed = await service("/storage/v1/object/sign/" + PROOF_BUCKET + "/" + proof.storage_path, {
    method: "POST",
    body: JSON.stringify({ expiresIn: 300 }),
  }) as JsonRecord;
  const relative = String(signed.signedURL || signed.signedUrl || "");
  if (!relative) throw new Error("URL temporaire indisponible.");
  const joiner = relative.includes("?") ? "&" : "?";
  return { url: SUPABASE_URL + "/storage/v1" + relative + joiner + "download=" + encodeURIComponent(String(proof.original_name || "preuve")) };
}

Deno.serve(async (req: Request) => {
  const origin = originFor(req);
  if (!origin) return new Response("Origin not allowed", { status: 403 });
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });
  if (!SUPABASE_URL || !SERVICE_KEY) return json(origin, 503, { detail: "Configuration serveur incomplète." });

  try {
    const user = await authenticatedUser(req);
    const url = new URL(req.url);
    const action = url.searchParams.get("action") || (req.method === "GET" ? "dashboard" : "");

    if (req.method === "GET") {
      if (action === "catalog") return json(origin, 200, await activeCatalog());
      if (action === "admin") return json(origin, 200, await adminDashboard(user.id));
      return json(origin, 200, await dashboard(user.id));
    }

    if (req.method !== "POST") return json(origin, 405, { detail: "Méthode non autorisée." });
    if (action === "submit_proof") return json(origin, 200, await uploadProof(req, user.id));

    const body = await req.json().catch(() => ({})) as JsonRecord;
    if (action === "create_order") return json(origin, 200, await createOrder(req, user.id, body));
    if (action === "save_plan") return json(origin, 200, await savePlan(user.id, body));
    if (action === "save_payment_method") return json(origin, 200, await savePaymentMethod(user.id, body));
    if (action === "save_settings") return json(origin, 200, await saveSettings(user.id, body));
    if (action === "admin_action") return json(origin, 200, await adminAction(user.id, body));
    if (action === "proof_url") return json(origin, 200, await proofUrl(user.id, body));

    return json(origin, 404, { detail: "Action inconnue." });
  } catch (error) {
    const mapped = messageFor(error);
    console.error("studio-billing", { detail: error instanceof Error ? error.message : String(error) });
    return json(origin, mapped.status, { detail: mapped.detail });
  }
});