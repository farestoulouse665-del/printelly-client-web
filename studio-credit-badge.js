"use strict";
(function () {
  var badge = document.getElementById("studioCreditsBadge");
  if (badge) {
    function update(event) {
      var detail = event.detail || {};
      if (!Number.isFinite(detail.available)) return;
      badge.textContent = "CRÉDITS • " + detail.available + (detail.reserved ? " (" + detail.reserved + " réservé)" : "");
      badge.classList.toggle("online", detail.available > 0);
      badge.title = detail.plan ? "Pack " + detail.plan : "Gérer mes packs Studio IA";
    }
    window.addEventListener("printelly:credits-updated", update);
  }

  if (!document.getElementById("bgRemoverView")) return;
  var style = document.createElement("link");
  style.rel = "stylesheet";
  style.href = "../studio-pro-upgrade.css";
  style.id = "studioProUpgradeStyles";
  document.head.appendChild(style);

  var script = document.createElement("script");
  script.src = "../studio-pro-upgrade.js";
  script.async = false;
  script.id = "studioProUpgradeScript";
  document.head.appendChild(script);
})();
