"use strict";
(function () {
  var badge = document.getElementById("studioCreditsBadge");
  if (!badge) return;
  function update(event) {
    var detail = event.detail || {};
    if (!Number.isFinite(detail.available)) return;
    badge.textContent = "CRÉDITS • " + detail.available + (detail.reserved ? " (" + detail.reserved + " réservé)" : "");
    badge.classList.toggle("online", detail.available > 0);
    badge.title = detail.plan ? "Pack " + detail.plan : "Gérer mes packs Studio IA";
  }
  window.addEventListener("printelly:credits-updated", update);
})();
