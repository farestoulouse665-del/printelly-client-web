type RemovalMode = "auto" | "person" | "design" | "product";

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
}

interface RemovalMetadata {
  width: number;
  height: number;
  processingMs: number;
  foregroundRatio: number;
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

async function apiError(response: Response): Promise<Error> {
  try {
    const body = (await response.json()) as { detail?: unknown };
    return new Error(typeof body.detail === "string" ? body.detail : `Erreur serveur ${response.status}.`);
  } catch {
    return new Error(`Erreur serveur ${response.status}.`);
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
        modelName: response.headers.get("x-model-name") ?? "modèle local",
        warnings,
      },
    };
  },
};

window.PrintellyBackgroundApi = client;
export {};
