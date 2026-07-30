"use strict";
(function () {
  const THEMES = ["light", "dark", "legendary"];
  const STORAGE_KEY = "printellyStudioTheme";
  const $ = (id) => document.getElementById(id);

  function preferredTheme() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (THEMES.includes(saved)) return saved;
    } catch (_) {}
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  }

  function applyTheme(theme, persist) {
    const selected = THEMES.includes(theme) ? theme : "dark";
    document.documentElement.dataset.studioTheme = selected;
    document.documentElement.style.colorScheme = selected === "light" ? "light" : "dark";
    document.body.classList.toggle("br-legendary-theme", selected === "legendary");
    document.body.dataset.studioTheme = selected;
    document.querySelectorAll("[data-studio-theme-choice]").forEach((button) => {
      const active = button.dataset.studioThemeChoice === selected;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
    const label = $("studioThemeCurrent");
    if (label) label.textContent = selected === "light" ? "Mode clair" : selected === "legendary" ? "Mode légendaire" : "Mode sombre";
    if (persist !== false) {
      try { localStorage.setItem(STORAGE_KEY, selected); } catch (_) {}
    }
    window.dispatchEvent(new CustomEvent("printelly:studio-theme", { detail: { theme: selected } }));
  }

  function installThemeSwitcher() {
    const actions = document.querySelector(".br-standalone-actions");
    if (!actions || $("studioThemeSwitcher")) return;
    const switcher = document.createElement("div");
    switcher.id = "studioThemeSwitcher";
    switcher.className = "studio-theme-switcher";
    switcher.setAttribute("role", "group");
    switcher.setAttribute("aria-label", "Thème du Studio AI");
    switcher.innerHTML = `
      <span id="studioThemeCurrent" class="studio-theme-current">Mode sombre</span>
      <button type="button" data-studio-theme-choice="light" aria-pressed="false" title="Activer le mode clair"><i aria-hidden="true">☀</i><span>Clair</span></button>
      <button type="button" data-studio-theme-choice="dark" aria-pressed="false" title="Activer le mode sombre"><i aria-hidden="true">◐</i><span>Sombre</span></button>
      <button type="button" data-studio-theme-choice="legendary" aria-pressed="false" title="Activer le mode légendaire"><i aria-hidden="true">✦</i><span>Légendaire</span></button>`;
    actions.insertBefore(switcher, actions.firstChild);
    switcher.querySelectorAll("[data-studio-theme-choice]").forEach((button) => {
      button.addEventListener("click", () => applyTheme(button.dataset.studioThemeChoice, true));
    });
    applyTheme(preferredTheme(), false);
  }

  function removeObsoleteSystems() {
    const recovery = $("brAdvancedSection");
    if (recovery) recovery.remove();
    const removal = $("brRemovalMenu");
    if (removal) removal.remove();
    document.querySelectorAll('[data-br-view="result"]').forEach((button) => button.remove());
    document.querySelectorAll(".studio-control-group header strong").forEach((title) => {
      if (title.textContent.trim().toLowerCase() === "finition") title.textContent = "Détails";
    });
  }

  function moveProfessionalTools() {
    const workspace = document.querySelector(".br-workspace");
    const left = $("brLeftControls");
    const right = $("brRightControls");
    const previewColumn = document.querySelector(".br-preview-column");
    if (!workspace || !left || !previewColumn) return false;

    if (right) {
      const exportPanel = right.querySelector(":scope > .br-export-panel");
      Array.from(right.children).forEach((child) => {
        if (child.classList.contains("br-side-title") || child === exportPanel) return;
        left.appendChild(child);
      });
      if (exportPanel) previewColumn.appendChild(exportPanel);
      right.remove();
    }

    const toggleRight = $("brToggleRight");
    if (toggleRight) toggleRight.remove();
    workspace.classList.remove("br-right-collapsed");
    workspace.classList.add("studio-two-zone");
    document.body.classList.add("studio-two-zone");

    const leftTitle = left.querySelector(":scope > .br-side-title");
    if (leftTitle) leftTitle.innerHTML = "<span>OUTILS AI</span><strong>Studio de production</strong><small>Détourage, retouches, couleurs, upscale et contrôle DTF</small>";

    let index = 1;
    left.querySelectorAll(":scope > .br-control-section, :scope > .br-quality-panel").forEach((section) => {
      if (section.hidden || section.getAttribute("aria-hidden") === "true") return;
      const badge = section.querySelector(":scope > .br-section-head > span");
      if (badge) badge.textContent = String(index).padStart(2, "0");
      index += 1;
    });
    return true;
  }

  function installBeforeAfter() {
    const splitButton = document.querySelector('[data-br-view="split"]');
    const originalButton = document.querySelector('[data-br-view="original"]');
    const splitControl = $("brSplitControl");
    const splitInput = $("brSplit");
    const shell = $("brCanvasShell");
    const download = $("brDownload");
    if (!splitButton || !shell) return;

    splitButton.textContent = "AVANT / APRÈS";
    splitButton.dataset.primaryView = "true";
    if (originalButton && (!download || download.disabled)) originalButton.click();

    if (!$("studioBeforeLabel")) {
      const before = document.createElement("span");
      before.id = "studioBeforeLabel";
      before.className = "studio-compare-label studio-before-label";
      before.textContent = "AVANT";
      const after = document.createElement("span");
      after.id = "studioAfterLabel";
      after.className = "studio-compare-label studio-after-label";
      after.textContent = "APRÈS";
      shell.append(before, after);
    }

    if (splitControl && !$("studioSplitReset")) {
      const reset = document.createElement("button");
      reset.id = "studioSplitReset";
      reset.className = "secondary studio-split-reset";
      reset.type = "button";
      reset.textContent = "RECENTRER À 50 %";
      reset.addEventListener("click", () => {
        if (!splitInput) return;
        splitInput.value = "50";
        splitInput.dispatchEvent(new Event("input", { bubbles: true }));
      });
      splitControl.appendChild(reset);
    }

    const activateSplit = () => {
      if (download && download.disabled) return;
      splitButton.click();
      if (splitInput) {
        splitInput.value = "50";
        splitInput.dispatchEvent(new Event("input", { bubbles: true }));
      }
      document.body.classList.add("studio-comparison-ready");
    };

    if (download) {
      const observer = new MutationObserver(() => {
        if (!download.disabled) setTimeout(activateSplit, 120);
      });
      observer.observe(download, { attributes: true, attributeFilter: ["disabled"] });
      if (!download.disabled) activateSplit();
    }

    document.querySelectorAll("[data-br-view]").forEach((button) => {
      button.addEventListener("click", () => {
        document.body.classList.toggle("studio-comparison-active", button.dataset.brView === "split");
      });
    });
  }

  function refineWorkflow() {
    const steps = document.querySelector(".br-pro-workflow");
    if (!steps) return;
    const items = steps.querySelectorAll("li");
    const labels = [
      ["Importer", "Original intact"],
      ["Détourer", "PhotoRoom sécurisé"],
      ["Avant / Après", "Contrôle immédiat"],
      ["Améliorer", "Couleurs et upscale 4K"],
      ["Commander", "Transfert direct"]
    ];
    items.forEach((item, index) => {
      if (!labels[index]) return;
      const span = item.querySelector("span");
      if (span) span.innerHTML = `${labels[index][0]}<small>${labels[index][1]}</small>`;
    });
  }

  function boot() {
    if (!$("bgRemoverView")) return;
    installThemeSwitcher();
    removeObsoleteSystems();
    moveProfessionalTools();
    installBeforeAfter();
    refineWorkflow();
    applyTheme(preferredTheme(), false);
    document.body.dataset.studioV3Ready = "true";
  }

  function waitForStudio(attempt) {
    if ($("brProColorControls") && $("brQualityPanel") && document.querySelector(".br-export-panel")) return boot();
    if (attempt > 120) return boot();
    setTimeout(() => waitForStudio(attempt + 1), 50);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => waitForStudio(0), { once: true });
  else waitForStudio(0);
})();
