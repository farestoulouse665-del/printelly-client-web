"use strict";
(function () {
  const $ = (id) => document.getElementById(id);
  const GROUPS = [
    { title: "Lumière", note: "Exposition, dynamique et profondeur", ids: ["exposure", "brightness", "contrast", "highlights", "shadows", "whites", "blacks"] },
    { title: "Couleurs", note: "Intensité, température et teinte", ids: ["saturation", "vibrance", "temperature", "hue"] },
    { title: "Détails", note: "Lisibilité des éléments fins", ids: ["detail"] }
  ];

  function refineCopy() {
    const head = document.querySelector(".br-page-head");
    if (head) {
      const eyebrow = head.querySelector(".eyebrow");
      const title = head.querySelector("h2");
      const description = head.querySelector("p:not(.eyebrow)");
      if (eyebrow) eyebrow.textContent = "STUDIO AI • PRODUCTION DTF";
      if (title) title.textContent = "Studio AI Pro";
      if (description) description.textContent = "Détourage, comparaison, colorimétrie, upscale et contrôle d’impression dans un espace unifié.";
    }
    const localNote = document.querySelector(".br-local-note span");
    if (localNote) localNote.innerHTML = "<strong>Traitement sécurisé.</strong> La clé PhotoRoom reste protégée dans Supabase et le PNG final conserve sa transparence réelle.";
    const leftTitle = document.querySelector("#brLeftControls .br-side-title");
    if (leftTitle) leftTitle.innerHTML = "<span>OUTILS AI</span><strong>Studio de production</strong><small>Importation, détourage, amélioration et contrôle DTF</small>";
  }

  function groupColorControls() {
    const grid = document.querySelector(".br-pro-color-grid");
    if (!grid || grid.dataset.grouped === "true") return;
    grid.dataset.grouped = "true";
    GROUPS.forEach((group) => {
      const section = document.createElement("section");
      section.className = "studio-control-group";
      section.innerHTML = `<header><strong>${group.title}</strong><small>${group.note}</small></header><div class="studio-control-group-body"></div>`;
      const body = section.querySelector(".studio-control-group-body");
      group.ids.forEach((key) => {
        const input = $("brColor_" + key);
        const label = input && input.closest(".br-pro-slider");
        if (!label) return;
        const reset = document.createElement("button");
        reset.type = "button";
        reset.className = "studio-slider-reset";
        reset.title = "Réinitialiser ce réglage";
        reset.setAttribute("aria-label", "Réinitialiser " + (label.querySelector("span")?.textContent || key));
        reset.textContent = "↺";
        reset.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          input.value = "0";
          input.dispatchEvent(new Event("input", { bubbles: true }));
          input.dispatchEvent(new Event("change", { bubbles: true }));
        });
        label.appendChild(reset);
        body.appendChild(label);
      });
      grid.appendChild(section);
    });
  }

  function createFinalSummary() {
    const panel = document.querySelector(".br-export-panel");
    if (!panel || $("studioFinalSummary")) return;
    const summary = document.createElement("section");
    summary.id = "studioFinalSummary";
    summary.className = "studio-final-summary";
    summary.innerHTML = `
      <div class="studio-final-summary-head"><span>FICHIER FINAL</span><b id="studioFinalStatus" data-state="waiting">EN ATTENTE</b></div>
      <div class="studio-final-metrics">
        <span><b id="studioFinalFile">Aucune image</b><small>Fichier</small></span>
        <span><b id="studioFinalDimensions">—</b><small>Dimensions</small></span>
        <span><b id="studioFinalDpi">300 DPI</b><small>Impression</small></span>
        <span><b id="studioFinalAlpha">PNG transparent</b><small>Transparence</small></span>
      </div>
      <p>Le fichier est ajouté dans « Photos à organiser » sans nouvelle consommation de crédit Studio AI.</p>`;
    const actions = panel.querySelector(".br-actions");
    panel.insertBefore(summary, actions || null);
  }

  function textFrom(id, fallback) {
    const element = $(id);
    return element && element.textContent.trim() ? element.textContent.trim() : fallback;
  }

  function syncFinalSummary() {
    const file = $("studioFinalFile");
    const dimensions = $("studioFinalDimensions");
    const dpi = $("studioFinalDpi");
    const alpha = $("studioFinalAlpha");
    const status = $("studioFinalStatus");
    if (!status) return;
    const imageMeta = textFrom("brImageMeta", "Aucune image");
    const resultInfo = textFrom("brResultInfo", "PNG transparent");
    const preflight = $("brProPreflightBadge");
    const printDpi = textFrom("brPrintBadge", "300 DPI");
    const fileParts = imageMeta.split("•").map((part) => part.trim()).filter(Boolean);
    if (file) file.textContent = fileParts[0] || imageMeta;
    if (dimensions) dimensions.textContent = fileParts.find((part) => /\d+\s*[×x]\s*\d+/.test(part)) || resultInfo.match(/\d+\s*[×x]\s*\d+\s*px/i)?.[0] || "—";
    if (dpi) dpi.textContent = printDpi;
    if (alpha) alpha.textContent = /alpha|transparent|rgba/i.test(resultInfo) ? "Alpha réel" : "À vérifier";
    if (preflight) {
      status.textContent = preflight.textContent.trim() || "EN ATTENTE";
      status.dataset.state = preflight.dataset.state || "waiting";
    } else {
      status.textContent = "EN ATTENTE";
      status.dataset.state = "waiting";
    }
  }

  function improveSectionFocus() {
    document.querySelectorAll(".br-control-section").forEach((section) => {
      section.addEventListener("focusin", () => section.classList.add("is-active-section"));
      section.addEventListener("focusout", () => {
        requestAnimationFrame(() => {
          if (!section.contains(document.activeElement)) section.classList.remove("is-active-section");
        });
      });
    });
  }

  function observeInterface() {
    const targets = [$("brImageMeta"), $("brResultInfo"), $("brPrintBadge"), $("brProPreflightBadge"), $("brDownload")].filter(Boolean);
    if (!targets.length) return;
    const observer = new MutationObserver(syncFinalSummary);
    targets.forEach((target) => observer.observe(target, { childList: true, subtree: true, attributes: true }));
  }

  function boot() {
    if (!$("bgRemoverView")) return;
    document.body.classList.add("br-pro-upgraded");
    refineCopy();
    groupColorControls();
    createFinalSummary();
    improveSectionFocus();
    syncFinalSummary();
    observeInterface();
    document.body.dataset.studioThemeReady = "true";
  }

  function waitForUpgrade(attempt) {
    if ($("brProColorControls") && $("brProPreflight")) return boot();
    if (attempt > 80) return boot();
    setTimeout(() => waitForUpgrade(attempt + 1), 50);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => waitForUpgrade(0), { once: true });
  else waitForUpgrade(0);
})();
