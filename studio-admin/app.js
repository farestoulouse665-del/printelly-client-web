"use strict";
(function () {
  var api = window.PrintellyStudioBilling;
  var state = { data: null, currentOrder: null };
  var statusLabels = {
    pending_payment: "Paiement attendu", waiting_proof: "Preuve attendue", proof_received: "À vérifier",
    under_review: "En vérification", additional_proof_required: "Nouvelle preuve demandée",
    approved: "Approuvé", paid: "Payé et actif", rejected: "Refusé", cancelled: "Annulé",
    expired: "Expiré", suspicious: "Suspect"
  };

  function $(selector, root) { return (root || document).querySelector(selector); }
  function all(selector, root) { return Array.from((root || document).querySelectorAll(selector)); }
  function esc(value) { return String(value == null ? "" : value).replace(/[&<>"']/g, function (char) { return ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"})[char]; }); }
  function money(value) { return new Intl.NumberFormat("fr-DZ", { maximumFractionDigits: 2 }).format(Number(value || 0)) + " DZD"; }
  function date(value) { return value ? new Intl.DateTimeFormat("fr-DZ", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "—"; }
  function toast(message) { var node = $("#toast"); node.textContent = message; node.classList.add("show"); clearTimeout(toast.timer); toast.timer = setTimeout(function () { node.classList.remove("show"); }, 3500); }
  function profileFor(userId) { return (state.data.profiles || []).find(function (item) { return item.id === userId; }) || {}; }
  function proofFor(orderId) { return (state.data.proofs || []).find(function (item) { return item.order_id === orderId; }); }
  function planFor(id) { return (state.data.plans || []).find(function (item) { return item.id === id; }); }
  function methodFor(id) { return (state.data.payment_methods || []).find(function (item) { return item.id === id; }); }

  function renderStats() {
    var orders = state.data.orders || [];
    var pending = orders.filter(function (item) { return ["proof_received", "under_review", "additional_proof_required", "suspicious"].includes(item.status); }).length;
    var paid = orders.filter(function (item) { return item.status === "paid"; }).length;
    var active = (state.data.subscriptions || []).filter(function (item) { return item.status === "active" || item.status === "expiring_soon"; }).length;
    $("#adminStats").innerHTML = [["À vérifier", pending], ["Paiements validés", paid], ["Packs actifs", active]].map(function (item) { return '<article class="admin-stat"><small>' + item[0] + '</small><strong>' + item[1] + '</strong></article>'; }).join("");
  }

  function renderPayments() {
    var orders = (state.data.orders || []).filter(function (item) { return !["pending_payment", "waiting_proof"].includes(item.status) || proofFor(item.id); });
    var list = $("#paymentsList");
    if (!orders.length) { list.innerHTML = '<div class="loading-card">Aucun paiement manuel à vérifier.</div>'; return; }
    list.innerHTML = orders.map(function (order) {
      var profile = profileFor(order.user_id); var proof = proofFor(order.id); var plan = order.plan_snapshot || {};
      var name = profile.full_name || [profile.first_name, profile.last_name].filter(Boolean).join(" ") || profile.email || profile.client_email || "Client";
      var terminal = ["paid", "cancelled", "expired"].includes(order.status);
      var actions = terminal ? "" : '<div class="admin-actions">' +
        (order.status !== "under_review" ? '<button class="review" data-action="review" data-order="' + order.id + '">Mettre en vérification</button>' : '') +
        (proof && ["proof_received", "under_review"].includes(order.status) ? '<button class="approve" data-action="approve" data-order="' + order.id + '">Accepter le paiement</button>' : '') +
        '<button class="reject" data-action="reject" data-order="' + order.id + '">Refuser</button><button data-action="request_proof" data-order="' + order.id + '">Demander une nouvelle preuve</button><button data-action="suspicious" data-order="' + order.id + '">Signaler suspect</button></div>';
      return '<article class="admin-card"><div class="admin-card-head"><div><h3>' + esc(order.reference) + ' · ' + esc(plan.name || "Pack Studio IA") + '</h3><p>' + esc(name) + ' · ' + esc(profile.phone || order.payer_phone || "Téléphone non renseigné") + '</p></div><span class="status ' + esc(order.status) + '">' + esc(statusLabels[order.status] || order.status) + '</span></div><div class="admin-meta"><div><small>ATTENDU</small><b>' + money(order.expected_amount_dzd) + '</b></div><div><small>DÉCLARÉ</small><b>' + money(order.declared_amount_dzd) + '</b></div><div><small>PAIEMENT</small><b>' + esc(order.payment_channel || "—") + ' · ' + esc(order.receipt_reference || "—") + '</b></div><div><small>DATE</small><b>' + date(order.payment_date || order.created_at) + '</b></div><div><small>RÉVISION</small><b>' + Number(order.revision || 0) + '</b></div></div>' + (order.rejection_reason ? '<p class="notice">Motif : ' + esc(order.rejection_reason) + '</p>' : '') + (proof ? '<div class="proof-info"><span>' + esc(proof.original_name) + ' · ' + Math.ceil(Number(proof.size_bytes || 0) / 1024) + ' Ko · stockage privé</span><button data-proof="' + proof.id + '">Ouvrir 5 min</button></div>' : '<p class="notice">Aucun justificatif reçu.</p>') + actions + '</article>';
    }).join("");
    all("[data-action]", list).forEach(function (button) { button.addEventListener("click", function () { openAction(button.dataset.order, button.dataset.action); }); });
    all("[data-proof]", list).forEach(function (button) { button.addEventListener("click", function () { openProof(button.dataset.proof, button); }); });
  }

  function renderPlans() {
    var list = $("#plansList"); var plans = state.data.plans || [];
    list.innerHTML = plans.length ? plans.map(function (plan) {
      return '<article class="plan-row"><div class="row-head"><div><h3>' + esc(plan.name) + '</h3><p>' + money(plan.price_dzd) + ' · ' + Number(plan.included_credits || 0) + ' crédits</p></div><button class="edit-button" data-edit-plan="' + plan.id + '">Modifier</button></div><div class="row-tags"><span>' + (plan.active ? "Actif" : "Inactif") + '</span><span>' + (plan.available_for_sale ? "En vente" : "Hors vente") + '</span><span>' + Number(plan.validity_days || 0) + ' jours</span><span>' + esc(plan.quality || "HD") + '</span><span>' + Math.round(Number(plan.max_file_size_bytes || 0) / 1048576) + ' Mo max.</span></div></article>';
    }).join("") : '<div class="loading-card">Aucun pack. Créez le premier pack Studio IA.</div>';
    all("[data-edit-plan]", list).forEach(function (button) { button.addEventListener("click", function () { editPlan(planFor(button.dataset.editPlan)); }); });
  }

  function renderMethods() {
    var list = $("#methodsList"); var methods = state.data.payment_methods || [];
    list.innerHTML = methods.length ? methods.map(function (method) {
      return '<article class="method-row"><div class="row-head"><div><h3>' + esc(method.label) + '</h3><p>' + esc(method.account_holder) + ' · CCP ' + esc(method.ccp_number || "—") + '</p></div><button class="edit-button" data-edit-method="' + method.id + '">Modifier</button></div><div class="row-tags"><span>' + (method.active ? "Actif" : "Désactivé") + '</span><span>Preuve sous ' + Number(method.proof_deadline_hours || 0) + ' h</span><span>Validation ~' + Number(method.average_validation_hours || 0) + ' h</span></div></article>';
    }).join("") : '<div class="loading-card">Aucune méthode active. Ajoutez vos coordonnées CCP.</div>';
    all("[data-edit-method]", list).forEach(function (button) { button.addEventListener("click", function () { editMethod(methodFor(button.dataset.editMethod)); }); });
  }

  async function load() {
    $("#refreshBtn").disabled = true;
    try {
      state.data = await api.admin();
      renderStats(); renderPayments(); renderPlans(); renderMethods();
    } catch (error) {
      toast(error.message);
      if (/administrateur|session|Connectez/i.test(error.message)) setTimeout(function () { location.href = "../"; }, 1200);
    } finally { $("#refreshBtn").disabled = false; }
  }

  function showTab(name) {
    all(".admin-tab").forEach(function (section) { section.classList.toggle("hidden", section.id !== name + "Tab"); });
    all(".nav-tab").forEach(function (button) { button.classList.toggle("active", button.dataset.tab === name); });
  }

  function resetPlan() {
    var form = $("#planForm"); form.reset(); form.elements.id.value = ""; form.elements.quality.value = "HD"; form.elements.max_file_mb.value = "25"; form.elements.max_image_side.value = "12000"; form.elements.concurrent_jobs.value = "1"; form.elements.max_batch_images.value = "1"; form.elements.retention_days.value = "7"; form.elements.active.checked = true; form.elements.available_for_sale.checked = true; form.classList.remove("hidden"); $("#planFormTitle").textContent = "Nouveau pack";
  }

  function editPlan(plan) {
    if (!plan) return; var form = $("#planForm"); form.classList.remove("hidden"); $("#planFormTitle").textContent = "Modifier " + plan.name;
    ["id","name","slug","description","price_dzd","included_credits","validity_days","quality","max_image_side","concurrent_jobs","max_batch_images","retention_days","badge","display_order"].forEach(function (key) { form.elements[key].value = plan[key] == null ? "" : plan[key]; });
    form.elements.max_file_mb.value = Math.round(Number(plan.max_file_size_bytes || 0) / 1048576);
    form.elements.features_text.value = Array.isArray(plan.features) ? plan.features.join("\n") : "";
    ["batch_allowed","active","available_for_sale","archived"].forEach(function (key) { form.elements[key].checked = Boolean(plan[key]); });
    form.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function savePlan(event) {
    event.preventDefault(); var form = event.currentTarget; var button = $("button[type=submit]", form); var values = Object.fromEntries(new FormData(form).entries());
    var payload = Object.assign({}, values, {
      max_file_size_bytes: Math.round(Number(values.max_file_mb || 0) * 1048576),
      background_removals: Number(values.included_credits || 0),
      features: String(values.features_text || "").split(/\r?\n/).map(function (item) { return item.trim(); }).filter(Boolean),
      batch_allowed: form.elements.batch_allowed.checked, active: form.elements.active.checked,
      available_for_sale: form.elements.available_for_sale.checked, archived: form.elements.archived.checked
    });
    delete payload.max_file_mb; delete payload.features_text; if (!payload.id) delete payload.id;
    button.disabled = true;
    try { await api.savePlan(payload); toast("Pack enregistré et synchronisé."); form.classList.add("hidden"); await load(); }
    catch (error) { $("#planMessage").textContent = error.message; }
    finally { button.disabled = false; }
  }

  function resetMethod() {
    var form = $("#methodForm"); form.reset(); form.elements.id.value = ""; form.elements.proof_deadline_hours.value = "48"; form.elements.average_validation_hours.value = "24"; form.elements.max_proof_mb.value = "10"; form.elements.active.checked = true; form.classList.remove("hidden"); $("#methodFormTitle").textContent = "Coordonnées de paiement";
  }

  function editMethod(method) {
    if (!method) return; var form = $("#methodForm"); form.classList.remove("hidden"); $("#methodFormTitle").textContent = "Modifier " + method.label;
    ["id","label","account_holder","ccp_number","ccp_key","baridimob_number","rip","instructions","proof_deadline_hours","average_validation_hours"].forEach(function (key) { form.elements[key].value = method[key] == null ? "" : method[key]; });
    form.elements.max_proof_mb.value = Math.round(Number(method.max_proof_bytes || 0) / 1048576); form.elements.active.checked = Boolean(method.active);
    form.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function saveMethod(event) {
    event.preventDefault(); var form = event.currentTarget; var button = $("button[type=submit]", form); var values = Object.fromEntries(new FormData(form).entries());
    var payload = Object.assign({}, values, { method_type: "ccp", max_proof_bytes: Math.round(Number(values.max_proof_mb || 0) * 1048576), active: form.elements.active.checked, display_order: 0 });
    delete payload.max_proof_mb; if (!payload.id) delete payload.id; button.disabled = true;
    try { await api.savePaymentMethod(payload); toast("Coordonnées CCP enregistrées."); form.classList.add("hidden"); await load(); }
    catch (error) { $("#methodMessage").textContent = error.message; }
    finally { button.disabled = false; }
  }

  async function openProof(proofId, button) {
    button.disabled = true;
    try { var data = await api.proofUrl(proofId); window.open(data.url, "_blank", "noopener,noreferrer"); }
    catch (error) { toast(error.message); }
    finally { button.disabled = false; }
  }

  function openAction(orderId, action) {
    var order = (state.data.orders || []).find(function (item) { return item.id === orderId; }); if (!order) return;
    state.currentOrder = order; var form = $("#actionForm"); form.reset(); form.elements.order_id.value = order.id; form.elements.expected_revision.value = order.revision; form.elements.admin_action.value = action;
    var plan = order.plan_snapshot || {}; var titles = { review: "Mettre en vérification", approve: "Accepter le paiement", reject: "Refuser le paiement", request_proof: "Demander une nouvelle preuve", suspicious: "Signaler comme suspect" };
    $("#actionTitle").textContent = titles[action]; $("#actionSummary").innerHTML = '<h3>' + esc(order.reference) + ' · ' + esc(plan.name || "Pack") + '</h3><p>' + money(order.expected_amount_dzd) + ' · ' + Number(plan.included_credits || 0) + ' crédits · version ' + Number(order.revision || 0) + '</p>';
    $("#actionReasonLabel").classList.toggle("hidden", !["reject", "request_proof", "suspicious"].includes(action));
    $("#approvalWarning").classList.toggle("hidden", action !== "approve");
    $("#actionSubmit").textContent = action === "approve" ? "Confirmer et activer le pack" : "Confirmer l’action";
    $("#actionMessage").textContent = ""; $("#actionDialog").showModal();
  }

  async function submitAction(event) {
    event.preventDefault(); var form = event.currentTarget; var button = $("#actionSubmit"); var payload = Object.fromEntries(new FormData(form).entries());
    payload.expected_revision = Number(payload.expected_revision); if (payload.admin_action === "approve" && !confirm("Confirmer définitivement ce paiement et ajouter les crédits ?")) return;
    button.disabled = true;
    try { await api.adminAction(payload); $("#actionDialog").close(); toast(payload.admin_action === "approve" ? "Paiement validé, pack activé et crédits ajoutés." : "Statut mis à jour."); await load(); }
    catch (error) { $("#actionMessage").textContent = error.message; }
    finally { button.disabled = false; }
  }

  try { api.session(); } catch (_) { location.href = "../"; }
  all(".nav-tab").forEach(function (button) { button.addEventListener("click", function () { showTab(button.dataset.tab); }); });
  $("#refreshBtn").addEventListener("click", load); $("#newPlanBtn").addEventListener("click", resetPlan); $("#newMethodBtn").addEventListener("click", resetMethod);
  $("#planForm").addEventListener("submit", savePlan); $("#methodForm").addEventListener("submit", saveMethod); $("#actionForm").addEventListener("submit", submitAction);
  all("[data-cancel-form]").forEach(function (button) { button.addEventListener("click", function () { button.closest("form").classList.add("hidden"); }); });
  all("[data-close]").forEach(function (button) { button.addEventListener("click", function () { button.closest("dialog").close(); }); });
  load();
})();
