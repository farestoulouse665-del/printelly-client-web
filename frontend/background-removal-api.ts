type RemovalMode = "auto" | "person" | "design" | "product";
type BackgroundCleanup = "light" | "normal" | "strong";

interface HealthResponse {
  status: string;
  model_loaded: boolean;
  model_name: string;
  device: "cpu" | "cuda";
  privacy: string;
}

interface RemovalOptions {
  mode: RemovalMode;
  feather: number;
  edgeShift: number;
  decontaminate: boolean;
  backgroundCleanup: BackgroundCleanup;
  protectDetails: boolean;
  removeHaze: boolean;
  backgroundColor?: string;
}

interface RemovalMetadata {
  width: number;
  height: number;
  processingMs: number;
  foregroundRatio: number;
  residualHazeRatio: number;
  sourceAlphaPreserved: boolean;
  effectiveMode: RemovalMode;
  requestId: string;
  modelName: string;
  warnings: string[];
}

interface RemovalResponse {
  blob: Blob;
  metadata: RemovalMetadata;
}

interface PrintellyBackgroundApi {
  health(baseUrl: string, signal?: AbortSignal): Promise<HealthResponse>;
  remove(
    baseUrl: string,
    file: File,
    options: RemovalOptions,
    signal?: AbortSignal,
  ): Promise<RemovalResponse>;
}

declare global {
  interface Window {
    PrintellyBackgroundApi: PrintellyBackgroundApi;
  }
}

function endpoint(baseUrl: string, path: string): string {
  return baseUrl.trim().replace(/\/+$/, "") + path;
}

function withRequestReference(message: string, reference: unknown): string {
  const clean = typeof reference === "string" ? reference.trim() : "";
  return clean ? `${message} Référence: ${clean.slice(0, 12)}.` : message;
}

async function apiError(response: Response): Promise<Error> {
  const headerReference = response.headers.get("x-request-id") ?? "";
  try {
    const body = (await response.json()) as { detail?: unknown; request_id?: unknown };
    const message = typeof body.detail === "string" ? body.detail : `Erreur serveur ${response.status}.`;
    return new Error(withRequestReference(message, headerReference || body.request_id));
  } catch {
    return new Error(withRequestReference(`Erreur serveur ${response.status}.`, headerReference));
  }
}

const client: PrintellyBackgroundApi = {
  async health(baseUrl, signal) {
    const request: RequestInit = { method: "GET", cache: "no-store" };
    if (signal) request.signal = signal;
    const response = await fetch(endpoint(baseUrl, "/api/health"), request);
    if (!response.ok) throw await apiError(response);
    return (await response.json()) as HealthResponse;
  },

  async remove(baseUrl, file, options, signal) {
    const form = new FormData();
    form.append("image", file, file.name);
    form.append("mode", options.mode);
    form.append("refine", "true");
    form.append("feather", String(options.feather));
    form.append("edge_shift", String(options.edgeShift));
    form.append("decontaminate", String(options.decontaminate));
    form.append("background_cleanup", options.backgroundCleanup);
    form.append("protect_details", String(options.protectDetails));
    form.append("remove_haze", String(options.removeHaze));
    if (options.backgroundColor) form.append("background_color", options.backgroundColor);

    const request: RequestInit = { method: "POST", body: form };
    if (signal) request.signal = signal;
    const response = await fetch(endpoint(baseUrl, "/api/remove-background"), request);
    if (!response.ok) throw await apiError(response);
    if (!(response.headers.get("content-type") ?? "").includes("image/png")) {
      throw new Error("Le serveur n’a pas retourné un PNG.");
    }

    let warnings: string[] = [];
    try {
      const parsed: unknown = JSON.parse(response.headers.get("x-warnings") ?? "[]");
      if (Array.isArray(parsed)) warnings = parsed.filter((item): item is string => typeof item === "string");
    } catch {
      warnings = ["Les avertissements du serveur sont illisibles."];
    }

    return {
      blob: await response.blob(),
      metadata: {
        width: Number(response.headers.get("x-image-width") ?? 0),
        height: Number(response.headers.get("x-image-height") ?? 0),
        processingMs: Number(response.headers.get("x-processing-ms") ?? 0),
        foregroundRatio: Number(response.headers.get("x-foreground-ratio") ?? 0),
        residualHazeRatio: Number(response.headers.get("x-residual-haze") ?? 0),
        sourceAlphaPreserved: response.headers.get("x-source-alpha-preserved") === "true",
        effectiveMode: (response.headers.get("x-effective-mode") as RemovalMode | null) ?? options.mode,
        requestId: response.headers.get("x-request-id") ?? "",
        modelName: response.headers.get("x-model-name") ?? "modèle local",
        warnings,
      },
    };
  },
};

window.PrintellyBackgroundApi = client;
export {};
