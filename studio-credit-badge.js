"use strict";
(function () {
  var THEMES = ["light", "dark", "legendary"];
  var STORAGE_KEY = "printellyStudioTheme";
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

  function initialTheme() {
    try {
      var saved = localStorage.getItem(STORAGE_KEY);
      if (THEMES.indexOf(saved) !== -1) return saved;
    } catch (_) {}
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  }

  var theme = initialTheme();
  document.documentElement.dataset.studioTheme = theme;
  document.documentElement.style.colorScheme = theme === "light" ? "light" : "dark";
  document.body.classList.add("br-pro-upgraded");
  document.body.classList.toggle("br-legendary-theme", theme === "legendary");

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
  loadStyle("../studio-three-themes.css", "studioThreeThemesStyles");
  loadStyle("../studio-upscale.css", "studioUpscaleStyles");
  loadScript("../studio-pro-upgrade.js", "studioProUpgradeScript", function () {
    loadScript("../studio-legendary-ui.js", "studioLegendaryUiScript", function () {
      loadScript("../studio-three-themes.js", "studioThreeThemesScript", function () {
        loadScript("../studio-upscale.js", "studioUpscaleScript");
      });
    });
  });
})();
