"use strict";
(function () {
  var api = window.PrintellyStudioBilling;
  var state = { data: null, busy: false, checkout: null, syncTimer: null };
  var labels = {
    pending_payment: "Paiement à effectuer", waiting_proof: "Preuve attendue",
    proof_received: "Preuve reçue", under_review: "Vérification en cours",
    additional_proof_required: "Nouvelle preuve demandée", approved: "Paiement accepté",
    paid: "Pack activé", rejected: "Paiement refusé", cancelled: "Annulée",
    expired: "Commande expirée", suspicious: "Vérification renforcée"
  };

  function $(selector, root) { return (root || document).querySelector(selector); }
  function all(selector, root) { return Array.from((root || document).querySelectorAll(selector)); }
  function esc(value) { return String(value == null ? "" : value).replace(/[&<>"']/g, function (char) { return ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"})[char]; }); }
  function money(value) { return new Intl.NumberFormat("fr-DZ", { maximumFractionDigits: 2 }).format(Number(value || 0)) + " DZD"; }
  function date(value) { return value ? new Intl.DateTimeFormat("fr-DZ", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "—"; }
  function bytes(value) { var mb = Number(value || 0) / 1048576; return (mb >= 1 ? mb.toFixed(mb >= 10 ? 0 : 1) + " Mo" : Math.round(Number(value || 0) / 1024) + " Ko"); }
  function toast(message) { var node = $("#toast"); node.textContent = message; node.classList.add("show"); clearTimeout(toast.timer); toast.timer = setTimeout(function () { node.classList.remove("show"); }, 3500); }
  function rpcValue(value) { return Array.isArray(value) && value.length === 1 ? value[0] : value; }
  function snapshot(order) { return order.plan_snapshot || {}; }

  function requireSession() {
    try { api.session(); }
    catch (error) { localStorage.setItem("printelly_return_to", location.href); location.href = "../"; throw error; }
  }

  function renderWallet() {
    var wallet = state.data.wallet || {};
    $("#walletCard").classList.remove("loading");
    var available = Number(wallet.available_credits || 0);
    $("#walletCard").innerHTML = '<div class="wallet-label">CRÉDITS DISPONIBLES</div><div class="wallet-balance"><strong>' + available + '</strong><span>images</span></div><div class="wallet-stats"><div><small>Réservés</small><b>' + Number(wallet.reserved_credits || 0) + '</b></div><div><small>Déjà utilisés</small><b>' + Number(wallet.consumed_credits || 0) + '</b></div></div>' + (available === 0 ? '<p class="wallet-empty">Vous avez utilisé tous vos crédits. Choisissez ou renouvelez un pack ci-dessous.</p>' : '');
  }

  function renderSubscription() {
    var active = (state.data.subscriptions || []).find(function (item) { return item.status === "active" || item.status === "expiring_soon"; });
    var section = $("#subscriptionSection");
    if (!active) { section.classList.add("hidden"); return; }
    var plan = active.plan_snapshot || {};
    section.classList.remove("hidden");
    $("#subscriptionCard").innerHTML = '<article class="subscription-card"><div><h3>' + esc(plan.name || "Pack Studio IA") + '</h3><p>' + esc((plan.features || []).join(" • ") || "Suppression de fond professionnelle") + '</p><button class="ghost choose-plan renew-button" data-plan-id="' + esc(plan.id || active.plan_id) + '">Renouveler mon pack</button></div><div class="subscription-dates"><div><small>ACTIVÉ LE</small><b>' + date(active.starts_at) + '</b></div><div><small>EXPIRE LE</small><b>' + date(active.expires_at) + '</b></div></div></article>';
  }

  function planFeatures(plan) {
    var result = [
      Number(plan.background_removals || plan.included_credits || 0) + " suppressions de fond",
      "Images jusqu’à " + bytes(plan.max_file_size_bytes),
      "Qualité " + esc(plan.quality || "HD"),
      Number(plan.concurrent_jobs || 1) + " traitement(s) simultané(s)",
      plan.batch_allowed ? "Lots jusqu’à " + Number(plan.max_batch_images || 1) + " images" : "Traitement image par image",
      "Validité " + Number(plan.validity_days || 0) + " jours"
    ];
    return result.concat(Array.isArray(plan.features) ? plan.features : []);
  }

  function renderPlans() {
    var plans = state.data.plans || [];
    var grid = $("#plansGrid");
    if (!plans.length) { grid.innerHTML = '<div class="loading-card">Aucun pack n’est disponible actuellement. Revenez bientôt.</div>'; return; }
    grid.innerHTML = plans.map(function (plan) {
      var featured = plan.badge ? " featured" : "";
      return '<article class="plan-card' + featured + '">' + (plan.badge ? '<span class="plan-badge">' + esc(plan.badge) + '</span>' : '') + '<h3>' + esc(plan.name) + '</h3><p class="plan-desc">' + esc(plan.description || "Crédits TransferLab prêts pour vos images.") + '</p><div class="price"><strong>' + esc(new Intl.NumberFormat("fr-DZ").format(Number(plan.price_dzd || 0))) + '</strong><span>DZD</span></div><div class="credits"><strong>' + Number(plan.included_credits || 0) + '</strong> crédits inclus</div><ul class="feature-list">' + planFeatures(plan).map(function (item) { return '<li>' + esc(item) + '</li>'; }).join("") + '</ul><button class="primary choose-plan" data-plan-id="' + esc(plan.id) + '">Choisir ce pack</button></article>';
    }).join("");
    all(".choose-plan").forEach(function (button) { button.addEventListener("click", choosePlan); });
  }

  function timelineIndex(status) {
    if (["pending_payment", "waiting_proof"].includes(status)) return 2;
    if (["proof_received", "additional_proof_required"].includes(status)) return 3;
    if (["under_review", "suspicious"].includes(status)) return 4;
    if (["approved", "paid"].includes(status)) return 6;
    return 0;
  }

  function canUpload(status) { return ["pending_payment", "waiting_proof", "additional_proof_required", "rejected"].includes(status); }

  function renderOrders() {
    var orders = state.data.orders || [];
    var list = $("#ordersList");
    if (!orders.length) { list.innerHTML = '<div class="loading-card">Aucune commande Studio IA. Choisissez un pack pour commencer.</div>'; return; }
    list.innerHTML = orders.map(function (order) {
      var plan = snapshot(order); var progress = timelineIndex(order.status);
      var steps = ["Pack choisi", "Commande créée", "Paiement effectué", "Preuve envoyée", "Vérification", "Activation"];
      var action = canUpload(order.status) ? '<button class="primary proof-button" data-order-id="' + esc(order.id) + '">Envoyer une preuve</button>' : '';
      if (order.status === "paid") action += '<a class="primary" href="../background-studio/">Utiliser Studio IA</a><button class="receipt-button" data-order-id="' + esc(order.id) + '">Télécharger le reçu</button>';
      return '<article class="order-card"><div class="order-head"><div><h3>' + esc(order.reference) + ' · ' + esc(plan.name || "Pack Studio IA") + '</h3><p>Créée le ' + date(order.created_at) + '</p></div><span class="status ' + esc(order.status) + '">' + esc(labels[order.status] || order.status) + '</span></div><div class="order-details"><div><small>MONTANT</small><b>' + money(order.expected_amount_dzd) + '</b></div><div><small>CRÉDITS</small><b>' + Number(plan.included_credits || 0) + '</b></div><div><small>PREUVE AVANT</small><b>' + date(order.proof_deadline_at) + '</b></div><div><small>DERNIÈRE MISE À JOUR</small><b>' + date(order.updated_at) + '</b></div></div>' + (order.rejection_reason ? '<p class="notice">Motif : ' + esc(order.rejection_reason) + '</p>' : '') + (order.review_note ? '<p class="notice">Message PRINTELLY : ' + esc(order.review_note) + '</p>' : '') + '<div class="timeline">' + steps.map(function (step, index) { var number = index + 1; return '<span class="' + (number < progress ? "done" : number === progress ? "current" : "") + '">' + esc(step) + '</span>'; }).join("") + '</div><div class="order-actions">' + action + '</div></article>';
    }).join("");
    all(".proof-button").forEach(function (button) { button.addEventListener("click", function () { openProof(button.dataset.orderId); }); });
    all(".receipt-button").forEach(function (button) { button.addEventListener("click", function () { downloadReceipt(button.dataset.orderId); }); });
  }

  function downloadReceipt(orderId) {
    var order = (state.data.orders || []).find(function (item) { return item.id === orderId; });
    if (!order || order.status !== "paid") return;
    var plan = snapshot(order);
    var lines = [
      "PRINTELLY — REÇU STUDIO IA", "",
      "Reçu : " + (order.receipt_number || order.reference),
      "Commande : " + order.reference,
      "Pack : " + (plan.name || "Studio IA"),
      "Montant : " + money(order.expected_amount_dzd),
      "Crédits : " + Number(plan.included_credits || 0),
      "Validé le : " + date(order.approved_at), "",
      "Ce reçu confirme l’activation du pack après validation administrative."
    ];
    var blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    var url = URL.createObjectURL(blob); var link = document.createElement("a");
    link.href = url; link.download = (order.receipt_number || order.reference) + ".txt"; link.click();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function renderUsage() {
    var jobs = state.data.jobs || [];
    var success = jobs.filter(function (job) { return job.status === "succeeded"; }).length;
    var failed = jobs.filter(function (job) { return job.status === "failed"; }).length;
    var wallet = state.data.wallet || {};
    $("#usageGrid").innerHTML = [
      ["Images traitées", jobs.length], ["Traitements réussis", success],
      ["Traitements échoués", failed], ["Crédits expirés", Number(wallet.expired_credits || 0)]
    ].map(function (item) { return '<article class="usage-card"><small>' + esc(item[0]) + '</small><strong>' + item[1] + '</strong></article>'; }).join("");
  }

  async function load(silent) {
    if (state.busy) return;
    state.busy = true; $("#refreshBtn").disabled = true;
    try {
      state.data = await api.dashboard();
      renderWallet(); renderSubscription(); renderPlans(); renderOrders(); renderUsage();
    } catch (error) {
      if (!silent) toast(error.message);
      if (/session|Connectez/i.test(error.message)) setTimeout(function () { location.href = "../"; }, 900);
    } finally { state.busy = false; $("#refreshBtn").disabled = false; }
  }

  async function choosePlan(event) {
    var button = event.currentTarget; var planId = button.dataset.planId;
    var method = (state.data.payment_methods || []).find(function (item) { return item.method_type === "ccp"; }) || state.data.payment_methods[0];
    if (!method) { toast("Le paiement CCP est momentanément désactivé."); return; }
    button.disabled = true; button.textContent = "Création…";
    try {
      var result = rpcValue(await api.createOrder(planId, method.id));
      state.checkout = result;
      showCheckout(result.order, result.payment_method || method);
      await load();
    } catch (error) { toast(error.message); }
    finally { button.disabled = false; button.textContent = "Choisir ce pack"; }
  }

  function copy(value, message) {
    navigator.clipboard.writeText(String(value || "")).then(function () { toast(message); }).catch(function () { toast("Copie impossible sur ce navigateur."); });
  }

  function showCheckout(order, method) {
    var plan = snapshot(order); var content = $("#checkoutContent");
    content.innerHTML = '<p class="eyebrow">PAIEMENT DE VOTRE PACK</p><h2>Commande ' + esc(order.reference) + '</h2><div class="checkout-summary"><h3>' + esc(plan.name) + '</h3><p>' + Number(plan.included_credits || 0) + ' crédits · ' + money(order.expected_amount_dzd) + '</p></div><div class="payment-grid"><div class="payment-field"><small>TITULAIRE</small><strong>' + esc(method.account_holder) + '</strong></div><div class="payment-field"><small>NUMÉRO CCP</small><strong>' + esc(method.ccp_number || "—") + (method.ccp_key ? ' · clé ' + esc(method.ccp_key) : '') + '</strong></div>' + (method.rip ? '<div class="payment-field"><small>RIP</small><strong>' + esc(method.rip) + '</strong></div>' : '') + (method.baridimob_number ? '<div class="payment-field"><small>BARIDIMOB</small><strong>' + esc(method.baridimob_number) + '</strong></div>' : '') + '<div class="payment-field"><small>MONTANT EXACT</small><strong>' + money(order.expected_amount_dzd) + '</strong></div><div class="payment-field"><small>RÉFÉRENCE</small><strong>' + esc(order.reference) + '</strong></div></div><div class="copy-row"><button data-copy="ccp">Copier le CCP</button><button data-copy="amount">Copier le montant</button><button data-copy="reference">Copier la référence</button></div>' + (method.instructions ? '<p class="notice">' + esc(method.instructions) + '</p>' : '') + '<p class="notice"><strong>Important :</strong> l’envoi de la preuve n’active jamais automatiquement le pack. Seule la validation d’un administrateur PRINTELLY ajoute les crédits. Preuve à envoyer avant ' + date(order.proof_deadline_at) + '.</p><button id="checkoutProofBtn" class="primary wide">J’ai effectué le paiement</button>';
    all("[data-copy]", content).forEach(function (button) { button.addEventListener("click", function () { var key = button.dataset.copy; var values = { ccp: method.ccp_number, amount: order.expected_amount_dzd, reference: order.reference }; copy(values[key], "Information copiée."); }); });
    $("#checkoutProofBtn").addEventListener("click", function () { $("#checkoutDialog").close(); openProof(order.id, order); });
    $("#checkoutDialog").showModal();
  }

  function openProof(orderId, knownOrder) {
    var order = knownOrder || (state.data.orders || []).find(function (item) { return item.id === orderId; });
    if (!order) return;
    $("#proofForm").reset();
    $("#proofOrderId").value = order.id;
    $("#proofReference").textContent = order.reference + " · " + money(order.expected_amount_dzd);
    $("#proofForm [name=amount_dzd]").value = Number(order.expected_amount_dzd || 0);
    $("#proofForm [name=payment_date]").value = new Date().toISOString().slice(0, 10);
    $("#proofMessage").textContent = "";
    $("#proofDialog").showModal();
  }

  async function submitProof(event) {
    event.preventDefault(); var form = event.currentTarget; var button = $("button[type=submit]", form);
    button.disabled = true; button.textContent = "Envoi sécurisé…"; $("#proofMessage").textContent = "";
    try {
      var data = new FormData(form);
      await api.submitProof(data);
      $("#proofDialog").close();
      toast("Preuve reçue. Votre paiement attend la validation administrateur.");
      await load();
    } catch (error) { $("#proofMessage").textContent = error.message; }
    finally { button.disabled = false; button.textContent = "Envoyer la preuve"; }
  }

  requireSession();
  $("#refreshBtn").addEventListener("click", load);
  $("#proofForm").addEventListener("submit", submitProof);
  all("[data-close]").forEach(function (button) { button.addEventListener("click", function () { button.closest("dialog").close(); }); });
  state.syncTimer = setInterval(function () { if (!document.hidden) load(true); }, 8000);
  document.addEventListener("visibilitychange", function () { if (!document.hidden) load(true); });
  window.addEventListener("focus", function () { load(true); });
  load(false);
})();
