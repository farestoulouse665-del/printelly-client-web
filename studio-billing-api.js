"use strict";
(function () {
  var SUPABASE_URL = "https://jitxplfujyypfepiajgz.supabase.co";
  var SUPABASE_KEY = "sb_publishable_RNFsiduo-sEQetJhfc6EnQ_U1nrM-SK";
  var ENDPOINT = SUPABASE_URL + "/functions/v1/printelly-studio-billing";

  function session() {
    var raw = localStorage.getItem("printelly_session");
    if (!raw) throw new Error("Connectez-vous à votre compte PRINTELLY.");
    try {
      var value = JSON.parse(raw);
      if (!value || !value.access_token) throw new Error("session");
      if (value.expires_at && Number(value.expires_at) * 1000 <= Date.now()) throw new Error("expired");
      return value;
    } catch (_) {
      throw new Error("Votre session a expiré. Reconnectez-vous.");
    }
  }

  function headers(body) {
    var result = {
      apikey: SUPABASE_KEY,
      Authorization: "Bearer " + session().access_token,
      Accept: "application/json"
    };
    if (!(body instanceof FormData)) result["Content-Type"] = "application/json";
    return result;
  }

  async function parse(response) {
    var data = null;
    try { data = await response.json(); } catch (_) { data = {}; }
    if (!response.ok) throw new Error(data && data.detail ? data.detail : "Erreur du service Studio IA.");
    return data;
  }

  async function request(action, options) {
    options = options || {};
    var url = ENDPOINT + "?action=" + encodeURIComponent(action || "dashboard");
    var response = await fetch(url, {
      method: options.method || "GET",
      cache: "no-store",
      body: options.body || undefined,
      headers: headers(options.body),
      signal: options.signal
    });
    return parse(response);
  }

  function json(action, payload) {
    return request(action, { method: "POST", body: JSON.stringify(payload || {}) });
  }

  window.PrintellyStudioBilling = {
    endpoint: ENDPOINT,
    session: session,
    dashboard: function () { return request("dashboard"); },
    catalog: function () { return request("catalog"); },
    admin: function () { return request("admin"); },
    createOrder: function (planId, paymentMethodId) {
      return json("create_order", {
        plan_id: planId,
        payment_method_id: paymentMethodId,
        idempotency_key: crypto.randomUUID()
      });
    },
    submitProof: function (formData) {
      return request("submit_proof", { method: "POST", body: formData });
    },
    savePlan: function (payload) { return json("save_plan", payload); },
    savePaymentMethod: function (payload) { return json("save_payment_method", payload); },
    adminAction: function (payload) {
      return json("admin_action", Object.assign({}, payload, { action_key: crypto.randomUUID() }));
    },
    proofUrl: function (proofId) { return json("proof_url", { proof_id: proofId }); }
  };
})();
