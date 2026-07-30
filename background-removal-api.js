"use strict";
(function () {
  var SUPABASE_URL = "https://jitxplfujyypfepiajgz.supabase.co";
  var SUPABASE_KEY = "sb_publishable_RNFsiduo-sEQetJhfc6EnQ_U1nrM-SK";
  var PRODUCTION_FUNCTION = SUPABASE_URL + "/functions/v1/printelly-background-removal";

  function normalizedBase(baseUrl) {
    var clean = String(baseUrl || "").trim().replace(/\/+$/, "");
    return clean || PRODUCTION_FUNCTION;
  }

  function endpoint(baseUrl, action) {
    var base = normalizedBase(baseUrl);
    if (/\/functions\/v1\//.test(base)) {
      return action === "health" ? base + "?action=health" : base;
    }
    return base + (action === "health" ? "/api/health" : "/api/remove-background");
  }

  function sessionToken() {
    var raw = localStorage.getItem("printelly_session");
    if (!raw) throw new Error("Connectez-vous à votre espace PRINTELLY avant d’utiliser TransferLab.");
    try {
      var session = JSON.parse(raw);
      if (!session || typeof session.access_token !== "string" || !session.access_token) {
        throw new Error("Session absente");
      }
      if (session.expires_at && Number(session.expires_at) * 1000 <= Date.now()) {
        throw new Error("Session expirée");
      }
      return session.access_token;
    } catch (_) {
      throw new Error("Votre session PRINTELLY a expiré. Reconnectez-vous puis revenez dans TransferLab.");
    }
  }

  function secureHeaders(accept) {
    return {
      "apikey": SUPABASE_KEY,
      "Authorization": "Bearer " + sessionToken(),
      "Accept": accept || "application/json"
    };
  }

  function withRequestReference(message, reference) {
    var clean = typeof reference === "string" ? reference.trim() : "";
    return clean ? message + " Référence: " + clean.slice(0, 12) + "." : message;
  }

  async function apiError(response) {
    var headerReference = response.headers.get("x-request-id") || "";
    try {
      var body = await response.json();
      var message = typeof body.detail === "string"
        ? body.detail
        : "Erreur du service " + response.status + ".";
      return new Error(withRequestReference(message, headerReference || body.request_id));
    } catch (_) {
      return new Error(withRequestReference("Erreur du service " + response.status + ".", headerReference));
    }
  }

  window.PrintellyBackgroundApi = {
    productionEndpoint: PRODUCTION_FUNCTION,

    async health(baseUrl, signal) {
      var response = await fetch(endpoint(baseUrl, "health"), {
        method: "GET",
        cache: "no-store",
        signal: signal,
        headers: secureHeaders("application/json")
      });
      if (!response.ok) throw await apiError(response);
      return response.json();
    },

    async remove(baseUrl, file, options, signal) {
      var form = new FormData();
      form.append("image", file, file.name);
      form.append("mode", options.mode || "auto");
      form.append("refine", "true");
      form.append("feather", String(options.feather));
      form.append("edge_shift", String(options.edgeShift));
      form.append("decontaminate", String(options.decontaminate));
      form.append("background_cleanup", options.backgroundCleanup || "normal");
      form.append("black_background_mode", options.blackBackgroundMode || "off");
      form.append("protect_details", String(options.protectDetails !== false));
      form.append("remove_haze", String(options.removeHaze !== false));
      if (options.backgroundColor) form.append("background_color", options.backgroundColor);

      var response = await fetch(endpoint(baseUrl, "remove"), {
        method: "POST",
        body: form,
        signal: signal,
        headers: secureHeaders("image/png")
      });
      if (!response.ok) throw await apiError(response);
      if (!(response.headers.get("content-type") || "").includes("image/png")) {
        throw new Error("Le service n’a pas retourné un véritable PNG transparent.");
      }

      var warnings = [];
      try {
        var parsed = JSON.parse(response.headers.get("x-warnings") || "[]");
        if (Array.isArray(parsed)) warnings = parsed.filter(function (item) {
          return typeof item === "string";
        });
      } catch (_) {
        warnings = ["Les avertissements du service n’ont pas pu être décodés."];
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
          effectiveMode: response.headers.get("x-effective-mode") || "auto",
          blackBackgroundMode: response.headers.get("x-black-background-mode") || "off",
          blackBackgroundConfidence: Number(response.headers.get("x-black-background-confidence") || 0),
          requestId: response.headers.get("x-request-id") || "",
          modelName: response.headers.get("x-model-name") || "PhotoRoom Remove Background",
          warnings: warnings
        }
      };
    }
  };
})();