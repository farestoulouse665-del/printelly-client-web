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
  document.documentElement.style.colorScheme = "dark";
  document.body.classList.add("br-pro-upgraded", "br-legendary-theme");

  function loadStyle(href, id) {
    if (document.getElementById(id)) return;
    var style = document.createElement("link");
    style.rel = "stylesheet";
    style.href = href;
    style.id = id;
    document.head.appendChild(style);
  }

  function loadScript(src, id, onload) {
    if (document.getElementById(id)) {
      if (onload) onload();
      return;
    }
    var script = document.createElement("script");
    script.src = src;
    script.async = false;
    script.id = id;
    if (onload) script.addEventListener("load", onload, { once: true });
    document.head.appendChild(script);
  }

  loadStyle("../studio-pro-upgrade.css", "studioProUpgradeStyles");
  loadScript("../studio-pro-upgrade.js", "studioProUpgradeScript", function () {
    loadScript("../studio-legendary-ui.js", "studioLegendaryUiScript");
  });
})();
