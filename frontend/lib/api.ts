import type {
  Asset,
  JobEvent,
  Preflight,
  ProcessingJob,
  Quote,
  RemovalMode,
  SizeLine,
  StudioOptions,
} from "@/lib/types";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api/v1";
const SESSION_KEY = "printelly-background-studio-guest";
let sessionPromise: Promise<string> | null = null;

type GuestSession = {
  id: string;
  token: string;
  expires_at: string;
  retention_days: number;
};

function browserStorage(): Storage | null {
  return typeof window === "undefined" ? null : window.localStorage;
}

export async function ensureGuestToken(): Promise<string> {
  const storage = browserStorage();
  const existing = storage?.getItem(SESSION_KEY);
  if (existing) return existing;
  if (!sessionPromise) {
    sessionPromise = fetch(`${API_BASE}/sessions/guest`, {
      method: "POST",
      headers: { Accept: "application/json" },
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Impossible de créer la session privée.");
        const session = (await response.json()) as GuestSession;
        storage?.setItem(SESSION_KEY, session.token);
        return session.token;
      })
      .finally(() => {
        sessionPromise = null;
      });
  }
  return sessionPromise;
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
  withGuest = true,
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (withGuest) headers.set("X-Guest-Token", await ensureGuestToken());
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });
  if (!response.ok) {
    let detail = `Erreur HTTP ${response.status}`;
    try {
      const body = (await response.json()) as { detail?: string | { message?: string } };
      detail =
        typeof body.detail === "string"
          ? body.detail
          : body.detail?.message ?? detail;
    } catch {
      // A non-JSON proxy error keeps the HTTP message.
    }
    if (response.status === 401) browserStorage()?.removeItem(SESSION_KEY);
    throw new Error(detail);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

async function directUpload(
  file: File,
  onProgress: (progress: number) => void,
  signal?: AbortSignal,
): Promise<Asset> {
  const token = await ensureGuestToken();
  return new Promise<Asset>((resolve, reject) => {
    const request = new XMLHttpRequest();
    const abort = () => request.abort();
    signal?.addEventListener("abort", abort, { once: true });
    request.open("POST", `${API_BASE}/assets/upload`);
    request.setRequestHeader("X-Guest-Token", token);
    request.setRequestHeader("Accept", "application/json");
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    request.onerror = () => reject(new Error("L’import a été interrompu par le réseau."));
    request.onabort = () => reject(new DOMException("Import annulé", "AbortError"));
    request.onload = () => {
      signal?.removeEventListener("abort", abort);
      if (request.status >= 200 && request.status < 300) {
        onProgress(100);
        resolve(JSON.parse(request.responseText) as Asset);
        return;
      }
      try {
        const response = JSON.parse(request.responseText) as { detail?: string };
        reject(new Error(response.detail ?? `Import refusé (${request.status}).`));
      } catch {
        reject(new Error(`Import refusé (${request.status}).`));
      }
    };
    const form = new FormData();
    form.set("image", file, file.name);
    request.send(form);
  });
}

async function chunkedUpload(
  file: File,
  onProgress: (progress: number) => void,
  signal?: AbortSignal,
): Promise<Asset> {
  const initialized = await apiFetch<{
    upload_id: string;
    chunk_size: number;
    expires_at: string;
  }>("/assets/upload/init", {
    method: "POST",
    body: JSON.stringify({
      filename: file.name,
      mime_type: file.type || "application/octet-stream",
      byte_size: file.size,
    }),
    signal,
  });
  let offset = 0;
  while (offset < file.size) {
    const chunk = file.slice(offset, Math.min(file.size, offset + initialized.chunk_size));
    await apiFetch(
      `/assets/upload/chunk?upload_id=${encodeURIComponent(initialized.upload_id)}&offset=${offset}`,
      { method: "POST", body: chunk, signal },
    );
    offset += chunk.size;
    onProgress(Math.round((offset / file.size) * 98));
  }
  const asset = await apiFetch<Asset>(
    `/assets/upload/complete?upload_id=${encodeURIComponent(initialized.upload_id)}`,
    { method: "POST", signal },
  );
  onProgress(100);
  return asset;
}

export function uploadAsset(
  file: File,
  onProgress: (progress: number) => void,
  signal?: AbortSignal,
): Promise<Asset> {
  return file.size > 16 * 1024 * 1024
    ? chunkedUpload(file, onProgress, signal)
    : directUpload(file, onProgress, signal);
}

export function listAssets(search = "", archived = false): Promise<{ items: Asset[]; total: number }> {
  const query = new URLSearchParams({ archived: String(archived), limit: "100" });
  if (search) query.set("search", search);
  return apiFetch(`/assets?${query}`);
}

export function createBackgroundJob(
  assetId: string,
  mode: RemovalMode,
  parameters: Record<string, unknown> = {},
): Promise<ProcessingJob> {
  return apiFetch("/background-removal/jobs", {
    method: "POST",
    body: JSON.stringify({ asset_id: assetId, mode, ...parameters }),
  });
}

export function getJob(jobId: string): Promise<ProcessingJob> {
  return apiFetch(`/background-removal/jobs/${jobId}`);
}

export function cancelJob(jobId: string): Promise<ProcessingJob> {
  return apiFetch(`/background-removal/jobs/${jobId}/cancel`, { method: "POST" });
}

export async function streamJobEvents(
  jobId: string,
  onEvent: (event: JobEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const token = await ensureGuestToken();
  const response = await fetch(`${API_BASE}/background-removal/jobs/${jobId}/events`, {
    headers: { Accept: "text/event-stream", "X-Guest-Token": token },
    signal,
    cache: "no-store",
  });
  if (!response.ok || !response.body) throw new Error("Progression en temps réel indisponible.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";
    for (const frame of frames) {
      const eventName = frame
        .split("\n")
        .find((line) => line.startsWith("event:"))
        ?.slice(6)
        .trim();
      if (eventName !== "progress") continue;
      const data = frame
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim())
        .join("\n");
      if (data) onEvent(JSON.parse(data) as JobEvent);
    }
  }
}

export function analyzePreflight(
  assetId: string,
  widthCm: number,
  heightCm: number,
): Promise<Preflight> {
  return apiFetch("/preflight/analyze", {
    method: "POST",
    body: JSON.stringify({
      asset_id: assetId,
      width: widthCm,
      height: heightCm,
      unit: "cm",
      target_dpi: 300,
    }),
  });
}

export function previewQuote(
  assetId: string,
  sizes: SizeLine[],
  options: StudioOptions,
): Promise<Quote> {
  return apiFetch("/quotes/preview", {
    method: "POST",
    body: JSON.stringify({
      lines: sizes.map((size) => ({
        asset_id: assetId,
        width_cm: size.widthCm,
        height_cm: size.heightCm,
        quantity: size.quantity,
        variants: size.variants,
        individual_cut: options.individualCut,
        resolution_enhancement: options.resolutionEnhancement,
        human_review: options.humanReview,
        cleanup_required: options.residueCleanup || options.haloRemoval,
      })),
      professional: false,
    }),
  });
}

export function createQuote(
  assetId: string,
  sizes: SizeLine[],
  options: StudioOptions,
): Promise<Quote> {
  return apiFetch("/quotes", {
    method: "POST",
    body: JSON.stringify({
      lines: sizes.map((size) => ({
        asset_id: assetId,
        width_cm: size.widthCm,
        height_cm: size.heightCm,
        quantity: size.quantity,
        variants: size.variants,
        individual_cut: options.individualCut,
        resolution_enhancement: options.resolutionEnhancement,
        human_review: options.humanReview,
        cleanup_required: options.residueCleanup || options.haloRemoval,
      })),
      professional: false,
    }),
  });
}

export function createPngExport(
  assetId: string,
  widthCm?: number,
  quantity = 1,
): Promise<{ download_url: string; filename: string }> {
  return apiFetch("/exports", {
    method: "POST",
    body: JSON.stringify({
      asset_id: assetId,
      format: "png",
      preserve_canvas: true,
      crop_to_content: false,
      margin_mm: 0,
      width_cm: widthCm,
      dpi: 300,
      quantity,
      remove_sensitive_metadata: true,
    }),
  });
}
