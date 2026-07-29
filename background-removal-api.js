"use strict";
(function () {
  function endpoint(baseUrl, path) {
    return baseUrl.trim().replace(/\/+$/, "") + path;
  }
  async function apiError(response) {
    try {
      const body = await response.json();
      return new Error(typeof body.detail === "string" ? body.detail : "Erreur serveur " + response.status + ".");
    } catch (_) {
      return new Error("Erreur serveur " + response.status + ".");
    }
  }
  window.PrintellyBackgroundApi = {
    async health(baseUrl, signal) {
      const response = await fetch(endpoint(baseUrl, "/api/health"), { method: "GET", cache: "no-store", signal });
      if (!response.ok) throw await apiError(response);
      return response.json();
    },
    async remove(baseUrl, file, options, signal) {
      const form = new FormData();
      form.append("image", file, file.name);
      form.append("mode", options.mode);
      form.append("refine", "true");
      form.append("feather", String(options.feather));
      form.append("edge_shift", String(options.edgeShift));
      form.append("decontaminate", String(options.decontaminate));
      form.append("background_cleanup", options.backgroundCleanup || "normal");
      form.append("protect_details", String(options.protectDetails !== false));
      form.append("remove_haze", String(options.removeHaze !== false));
      if (options.backgroundColor) form.append("background_color", options.backgroundColor);
      const response = await fetch(endpoint(baseUrl, "/api/remove-background"), { method: "POST", body: form, signal });
      if (!response.ok) throw await apiError(response);
      if (!(response.headers.get("content-type") || "").includes("image/png")) throw new Error("Le serveur n’a pas retourné un PNG.");
      let warnings = [];
      try {
        const parsed = JSON.parse(response.headers.get("x-warnings") || "[]");
        if (Array.isArray(parsed)) warnings = parsed.filter(item => typeof item === "string");
      } catch (_) {
        warnings = ["Les avertissements du serveur sont illisibles."];
      }
      return {
        blob: await response.blob(),
        metadata: {
          width: Number(response.headers.get("x-image-width") || 0),
          height: Number(response.headers.get("x-image-height") || 0),
          processingMs: Number(response.headers.get("x-processing-ms") || 0),
          foregroundRatio: Number(response.headers.get("x-foreground-ratio") || 0),
          residualHazeRatio: Number(response.headers.get("x-residual-haze") || 0),
          sourceAlphaPreserved: response.headers.get("x-source-alpha-preserved") === "true",
          effectiveMode: response.headers.get("x-effective-mode") || options.mode,
          modelName: response.headers.get("x-model-name") || "modèle local",
          warnings
        }
      };
    }
  };
})();
