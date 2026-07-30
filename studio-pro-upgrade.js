"use strict";
(function () {
  const DB_NAME = "printelly-studio-handoff-v1";
  const STORE_NAME = "handoffs";
  const PENDING_ID = "pending-order-file";
  const state = {
    settings: {
      brightness: 0,
      contrast: 0,
      saturation: 0,
      vibrance: 0,
      temperature: 0,
      exposure: 0,
      shadows: 0,
      highlights: 0,
      blacks: 0,
      whites: 0,
      hue: 0,
      detail: 0
    },
    history: [],
    redo: [],
    compare: false,
    busy: false,
    lastPreflight: null
  };

  const $ = (id) => document.getElementById(id);
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const copySettings = () => ({ ...state.settings });

  function openDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: "id" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Stockage local indisponible."));
    });
  }

  async function saveHandoff(record) {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(record);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error || new Error("Impossible de préparer la commande."));
      tx.onabort = () => reject(tx.error || new Error("Préparation de la commande annulée."));
    });
    db.close();
  }

  function setMessage(text, type) {
    const message = $("brMessage");
    if (!message) return;
    message.textContent = text || "";
    message.className = "br-message" + (type ? " " + type : "");
  }

  function injectWorkflow() {
    const pageHead = document.querySelector(".br-page-head");
    if (!pageHead || document.querySelector(".br-pro-command-center")) return;
    const hero = document.createElement("section");
    hero.className = "br-pro-command-center";
    hero.innerHTML = `
      <div class="br-pro-command-copy">
        <span class="br-pro-kicker">STUDIO AI PRO • PRÉPARATION DTF</span>
        <h1>Du détourage à la commande, sans perdre la qualité.</h1>
        <p>Un espace de production unique pour nettoyer, corriger les couleurs, contrôler le fichier et l’envoyer directement dans « Photos à organiser ».</p>
      </div>
      <div class="br-pro-status-grid" aria-label="Garanties Studio AI">
        <span><b>PNG</b><small>Alpha réel conservé</small></span>
        <span><b>PRO</b><small>Interface unique</small></span>
        <span><b>DTF</b><small>Préflight impression</small></span>
      </div>
      <ol class="br-pro-workflow" aria-label="Étapes du Studio AI">
        <li data-pro-step="import" class="active"><b>01</b><span>Importer<small>Original intact</small></span></li>
        <li data-pro-step="remove"><b>02</b><span>Détourer<small>PhotoRoom sécurisé</small></span></li>
        <li data-pro-step="color"><b>03</b><span>Couleurs<small>Correction non destructive</small></span></li>
        <li data-pro-step="quality"><b>04</b><span>Contrôler<small>Préflight DTF</small></span></li>
        <li data-pro-step="order"><b>05</b><span>Commander<small>Transfert direct</small></span></li>
      </ol>`;
    pageHead.insertAdjacentElement("afterend", hero);
  }

  function forceProfessionalMode() {
    const workspace = document.querySelector(".br-workspace");
    if (workspace) workspace.dataset.studioMode = "pro";
    try { localStorage.setItem("printellyStudioMode", "pro"); } catch (_) {}
    const modePicker = document.querySelector(".br-studio-mode");
    if (modePicker) modePicker.remove();
    document.querySelectorAll("[data-br-pro-only]").forEach((element) => {
      element.hidden = false;
      element.removeAttribute("aria-hidden");
    });

    const advanced = $("brAdvancedSection");
    if (advanced) {
      advanced.hidden = true;
      advanced.setAttribute("aria-hidden", "true");
      advanced.dataset.removedFromStudio = "background-recovery";
    }

    const removalMenu = $("brRemovalMenu");
    if (removalMenu) {
      removalMenu.hidden = true;
      removalMenu.setAttribute("aria-hidden", "true");
      removalMenu.dataset.removedFromStudio = "professional-remove-background";
    }

    const correctionSection = removalMenu && removalMenu.closest(".br-control-section");
    if (correctionSection) {
      const head = correctionSection.querySelector(":scope > .br-section-head");
      if (head) head.innerHTML = '<span>04</span><div><h3>Retouches professionnelles</h3><p>Couleurs, détails, masque manuel et préparation DTF</p></div>';
    }
  }

  const controls = [
    ["exposure", "Exposition", -2, 2, 0.1, " IL"],
    ["brightness", "Luminosité", -100, 100, 1, ""],
    ["contrast", "Contraste", -100, 100, 1, ""],
    ["saturation", "Saturation", -100, 100, 1, ""],
    ["vibrance", "Vibrance", -100, 100, 1, ""],
    ["temperature", "Température", -100, 100, 1, ""],
    ["hue", "Teinte", -180, 180, 1, "°"],
    ["shadows", "Ombres", -100, 100, 1, ""],
    ["highlights", "Hautes lumières", -100, 100, 1, ""],
    ["blacks", "Noirs", -100, 100, 1, ""],
    ["whites", "Blancs", -100, 100, 1, ""],
    ["detail", "Détails fins", 0, 100, 1, " %"]
  ];

  function formatControlValue(key, value, suffix) {
    if (key === "exposure") return Number(value).toFixed(1).replace(".0", "") + suffix;
    return String(Math.round(Number(value))) + suffix;
  }

  function colorFilter(settings) {
    const brightness = clamp(100 + settings.brightness + settings.exposure * 28, 10, 260);
    const contrast = clamp(100 + settings.contrast, 10, 260);
    const saturation = clamp(100 + settings.saturation + settings.vibrance * 0.45, 0, 300);
    return `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%) hue-rotate(${settings.hue}deg)`;
  }

  function applyPreviewFilter() {
    const canvas = $("brCanvas");
    if (!canvas) return;
    canvas.style.filter = state.compare ? "none" : colorFilter(state.settings);
    canvas.style.transition = "filter 120ms ease";
    const compare = $("brProCompare");
    if (compare) compare.textContent = state.compare ? "VOIR LE RÉSULTAT" : "MAINTENIR AVANT / APRÈS";
    const dirty = controls.some(([key]) => Number(state.settings[key]) !== 0);
    document.body.classList.toggle("br-pro-color-dirty", dirty);
  }

  function updateColorOutputs() {
    controls.forEach(([key, , , , , suffix]) => {
      const input = $("brColor_" + key);
      const output = $("brColorValue_" + key);
      if (input) input.value = String(state.settings[key]);
      if (output) output.textContent = formatControlValue(key, state.settings[key], suffix);
    });
    applyPreviewFilter();
  }

  function commitColorState(previous) {
    if (!previous) return;
    const changed = controls.some(([key]) => Number(previous[key]) !== Number(state.settings[key]));
    if (!changed) return;
    state.history.push(previous);
    if (state.history.length > 30) state.history.shift();
    state.redo = [];
    updateColorHistoryButtons();
  }

  function updateColorHistoryButtons() {
    const undo = $("brColorUndo");
    const redo = $("brColorRedo");
    if (undo) undo.disabled = !state.history.length;
    if (redo) redo.disabled = !state.redo.length;
  }

  function addColorControls() {
    const menu = $("brPaletteMenu");
    const panel = menu && menu.querySelector(".br-removal-panel");
    if (!menu || !panel || $("brProColorControls")) return;
    const summary = menu.querySelector("summary");
    if (summary) summary.innerHTML = '<span>COULEURS DU DESIGN</span><small>Correction professionnelle non destructive</small>';
    menu.open = true;

    const wrapper = document.createElement("section");
    wrapper.id = "brProColorControls";
    wrapper.className = "br-pro-color-controls";
    wrapper.innerHTML = `
      <div class="br-pro-tool-head">
        <div><span>COLORIMÉTRIE DTF</span><strong>Corriger sans toucher à la transparence</strong><small>L’aperçu est instantané. Le calcul haute résolution est appliqué uniquement au téléchargement ou à la commande.</small></div>
        <button id="brColorAuto" class="primary" type="button">AMÉLIORATION AUTO</button>
      </div>
      <div class="br-pro-color-grid">
        ${controls.map(([key, label, min, max, step, suffix]) => `
          <label class="br-pro-slider"><span>${label}<output id="brColorValue_${key}">${formatControlValue(key, state.settings[key], suffix)}</output></span><input id="brColor_${key}" type="range" min="${min}" max="${max}" step="${step}" value="${state.settings[key]}"></label>`).join("")}
      </div>
      <div class="br-pro-color-actions">
        <button id="brColorUndo" class="secondary" type="button" disabled>↶ ANNULER COULEURS</button>
        <button id="brColorRedo" class="secondary" type="button" disabled>↷ RÉTABLIR</button>
        <button id="brProCompare" class="secondary" type="button">MAINTENIR AVANT / APRÈS</button>
        <button id="brColorReset" class="secondary" type="button">RÉINITIALISER</button>
      </div>`;
    panel.insertBefore(wrapper, panel.firstChild);

    controls.forEach(([key]) => {
      const input = $("brColor_" + key);
      let previous = copySettings();
      input.addEventListener("pointerdown", () => { previous = copySettings(); });
      input.addEventListener("keydown", () => { previous = copySettings(); }, { once: true });
      input.addEventListener("input", () => {
        state.settings[key] = Number(input.value);
        updateColorOutputs();
        markWorkflow("color");
      });
      input.addEventListener("change", () => commitColorState(previous));
    });

    $("brColorAuto").addEventListener("click", () => {
      const previous = copySettings();
      Object.assign(state.settings, { exposure: 0.15, brightness: 3, contrast: 9, saturation: 5, vibrance: 14, temperature: 0, shadows: 7, highlights: -4, blacks: -3, whites: 4, hue: 0, detail: 18 });
      commitColorState(previous);
      updateColorOutputs();
      markWorkflow("color");
    });
    $("brColorReset").addEventListener("click", () => {
      const previous = copySettings();
      controls.forEach(([key]) => { state.settings[key] = 0; });
      commitColorState(previous);
      updateColorOutputs();
    });
    $("brColorUndo").addEventListener("click", () => {
      if (!state.history.length) return;
      state.redo.push(copySettings());
      state.settings = state.history.pop();
      updateColorOutputs();
      updateColorHistoryButtons();
    });
    $("brColorRedo").addEventListener("click", () => {
      if (!state.redo.length) return;
      state.history.push(copySettings());
      state.settings = state.redo.pop();
      updateColorOutputs();
      updateColorHistoryButtons();
    });
    const compare = $("brProCompare");
    const showOriginal = () => { state.compare = true; applyPreviewFilter(); };
    const showResult = () => { state.compare = false; applyPreviewFilter(); };
    compare.addEventListener("pointerdown", showOriginal);
    compare.addEventListener("pointerup", showResult);
    compare.addEventListener("pointerleave", showResult);
    compare.addEventListener("keydown", (event) => { if (event.code === "Space" || event.code === "Enter") showOriginal(); });
    compare.addEventListener("keyup", showResult);
    updateColorOutputs();
  }

  function markWorkflow(step) {
    const order = ["import", "remove", "color", "quality", "order"];
    const index = order.indexOf(step);
    document.querySelectorAll("[data-pro-step]").forEach((item) => {
      const itemIndex = order.indexOf(item.dataset.proStep);
      item.classList.toggle("active", itemIndex === index);
      item.classList.toggle("done", itemIndex < index);
    });
  }

  function addQualityEnhancements() {
    const panel = $("brQualityPanel");
    if (!panel || $("brProPreflight")) return;
    const qualitySettings = panel.querySelector(".br-quality-settings");
    const pro = document.createElement("section");
    pro.id = "brProPreflight";
    pro.className = "br-pro-preflight";
    pro.innerHTML = `
      <div class="br-pro-tool-head">
        <div><span>PRÉFLIGHT PROFESSIONNEL</span><strong>Contrôle complet avant impression</strong><small>Transparence, bords, semi-transparence, résolution, dimensions, poids et sécurité d’export.</small></div>
        <b id="brProPreflightBadge" data-state="waiting">EN ATTENTE</b>
      </div>
      <div id="brProPreflightChecks" class="br-pro-check-grid">
        <span data-check="alpha"><i>—</i><b>Alpha réel</b><small>En attente</small></span>
        <span data-check="dpi"><i>—</i><b>Résolution</b><small>En attente</small></span>
        <span data-check="edges"><i>—</i><b>Marges</b><small>En attente</small></span>
        <span data-check="semi"><i>—</i><b>Contours</b><small>En attente</small></span>
        <span data-check="format"><i>—</i><b>PNG</b><small>En attente</small></span>
        <span data-check="size"><i>—</i><b>Poids</b><small>En attente</small></span>
      </div>
      <div id="brProRecommendations" class="br-pro-recommendations"><p>Terminez le détourage pour lancer le contrôle automatique.</p></div>`;
    if (qualitySettings) qualitySettings.insertAdjacentElement("beforebegin", pro);
    else panel.appendChild(pro);
  }

  function renderPreflight(report) {
    state.lastPreflight = report;
    const badge = $("brProPreflightBadge");
    if (badge) {
      badge.dataset.state = report.state;
      badge.textContent = report.label;
    }
    const setCheck = (name, stateName, value, note) => {
      const card = document.querySelector(`[data-check="${name}"]`);
      if (!card) return;
      card.dataset.state = stateName;
      card.querySelector("i").textContent = value;
      card.querySelector("small").textContent = note;
    };
    setCheck("alpha", report.alphaReal ? "good" : "bad", report.alphaReal ? "OK" : "NON", report.alphaReal ? "Transparence détectée" : "Canal alpha absent");
    setCheck("dpi", report.dpi >= 300 ? "good" : report.dpi >= 150 ? "warn" : "bad", report.dpi ? report.dpi + " DPI" : "—", report.dpi >= 300 ? "Prêt DTF" : "Taille à vérifier");
    setCheck("edges", report.edgeContact < 0.015 ? "good" : report.edgeContact < 0.05 ? "warn" : "bad", Math.round(report.edgeContact * 1000) / 10 + "%", report.edgeContact < 0.015 ? "Marge sûre" : "Le design touche le bord");
    setCheck("semi", report.semiRatio < 0.12 ? "good" : report.semiRatio < 0.28 ? "warn" : "bad", Math.round(report.semiRatio * 1000) / 10 + "%", report.semiRatio < 0.12 ? "Contours nets" : "Semi-transparence élevée");
    setCheck("format", report.type === "image/png" ? "good" : "bad", report.type === "image/png" ? "PNG" : "ERREUR", report.type === "image/png" ? "Format conforme" : "Conversion requise");
    setCheck("size", report.size <= 50 * 1024 * 1024 ? "good" : "bad", formatBytes(report.size), report.size <= 50 * 1024 * 1024 ? "Poids accepté" : "Plus de 50 Mo");
    const recommendations = $("brProRecommendations");
    if (recommendations) recommendations.innerHTML = report.issues.length
      ? report.issues.map((issue) => `<article data-severity="${issue.severity}"><b>${issue.title}</b><p>${issue.text}</p><span>${issue.action}</span></article>`).join("")
      : '<article data-severity="success"><b>Fichier prêt à imprimer</b><p>Le PNG conserve sa transparence, ses dimensions et des marges sûres.</p><span>Vous pouvez l’ajouter à la commande.</span></article>';
    markWorkflow("quality");
  }

  function formatBytes(value) {
    const size = Number(value) || 0;
    if (size < 1024) return size + " o";
    if (size < 1024 * 1024) return (size / 1024).toFixed(1) + " Kio";
    return (size / 1024 / 1024).toFixed(1) + " Mio";
  }

  function selectedDpi() {
    const select = $("brExportDpi");
    if (!select) return 300;
    if (select.value === "custom") return clamp(Number($("brCustomDpi") && $("brCustomDpi").value) || 300, 36, 1200);
    return Number(select.value) || 300;
  }

  async function inspectBlob(blob) {
    const bitmap = await createImageBitmap(blob);
    const maxSide = 1200;
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const sourceWidth = bitmap.width;
    const sourceHeight = bitmap.height;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const pixels = ctx.getImageData(0, 0, width, height).data;
    let transparent = 0;
    let semi = 0;
    let edge = 0;
    let visible = 0;
    const border = Math.max(1, Math.round(Math.min(width, height) * 0.02));
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const alpha = pixels[(y * width + x) * 4 + 3];
        if (alpha < 250) transparent += 1;
        if (alpha > 0 && alpha < 250) semi += 1;
        if (alpha > 16) {
          visible += 1;
          if (x < border || y < border || x >= width - border || y >= height - border) edge += 1;
        }
      }
    }
    const total = width * height;
    const alphaReal = transparent > total * 0.002;
    const semiRatio = visible ? semi / visible : 0;
    const edgeContact = visible ? edge / visible : 0;
    const dpi = selectedDpi();
    const issues = [];
    if (!alphaReal) issues.push({ severity: "error", title: "Transparence absente", text: "Le fichier ne contient pas assez de pixels transparents.", action: "Vérifiez le détourage avant l’envoi." });
    if (dpi < 150) issues.push({ severity: "error", title: "Résolution insuffisante", text: `Le réglage actuel est de ${dpi} DPI.`, action: "Choisissez 300 DPI pour l’impression DTF." });
    else if (dpi < 300) issues.push({ severity: "warning", title: "Résolution à vérifier", text: `Le fichier sera préparé à ${dpi} DPI.`, action: "300 DPI est recommandé pour les détails fins." });
    if (edgeContact >= 0.05) issues.push({ severity: "error", title: "Design collé au bord", text: "Une partie importante du sujet touche les limites du canvas.", action: "Ajoutez une marge ou vérifiez qu’aucun détail n’est coupé." });
    else if (edgeContact >= 0.015) issues.push({ severity: "warning", title: "Marge réduite", text: "Le sujet est proche des limites du fichier.", action: "Contrôlez les quatre côtés avant impression." });
    if (semiRatio >= 0.28) issues.push({ severity: "error", title: "Contours très transparents", text: "Une forte proportion du sujet est semi-transparente.", action: "Contrôlez les halos et les détails fins sur fond noir et blanc." });
    else if (semiRatio >= 0.12) issues.push({ severity: "warning", title: "Semi-transparence élevée", text: "Les contours contiennent beaucoup de pixels partiellement transparents.", action: "Vérifiez les cheveux, ombres et halos." });
    if (blob.size > 50 * 1024 * 1024) issues.push({ severity: "error", title: "Fichier trop lourd", text: "Le PNG dépasse la limite de 50 Mo.", action: "Réduisez uniquement les dimensions si la taille d’impression le permet." });
    const hasError = issues.some((issue) => issue.severity === "error");
    const hasWarning = issues.some((issue) => issue.severity === "warning");
    return {
      width: sourceWidth,
      height: sourceHeight,
      alphaReal,
      semiRatio,
      edgeContact,
      dpi,
      type: blob.type,
      size: blob.size,
      issues,
      state: hasError ? "bad" : hasWarning ? "warn" : "good",
      label: hasError ? "NON CONFORME" : hasWarning ? "À VÉRIFIER" : "PRÊT À IMPRIMER"
    };
  }

  function transformPixelData(data, settings) {
    const temperature = settings.temperature * 0.55;
    const vibrance = settings.vibrance / 100;
    const shadows = settings.shadows / 100;
    const highlights = settings.highlights / 100;
    const blacks = settings.blacks / 100;
    const whites = settings.whites / 100;
    const detail = settings.detail / 100;
    for (let i = 0; i < data.length; i += 4) {
      const alpha = data[i + 3];
      if (alpha === 0) continue;
      let r = data[i];
      let g = data[i + 1];
      let b = data[i + 2];
      r += temperature;
      b -= temperature;
      let luma = (r * 0.2126 + g * 0.7152 + b * 0.0722) / 255;
      const max = Math.max(r, g, b);
      const average = (r + g + b) / 3;
      const vibration = (max - average) / 255 * vibrance * 1.8;
      r = average + (r - average) * (1 + vibration);
      g = average + (g - average) * (1 + vibration);
      b = average + (b - average) * (1 + vibration);
      const shadowLift = shadows * Math.pow(1 - luma, 2) * 80;
      const highlightLift = highlights * Math.pow(luma, 2) * 65;
      const blackCurve = blacks * Math.pow(1 - luma, 3) * -58;
      const whiteCurve = whites * Math.pow(luma, 3) * 58;
      const local = (luma - 0.5) * detail * 22;
      r += shadowLift + highlightLift + blackCurve + whiteCurve + local;
      g += shadowLift + highlightLift + blackCurve + whiteCurve + local;
      b += shadowLift + highlightLift + blackCurve + whiteCurve + local;
      data[i] = clamp(Math.round(r), 0, 255);
      data[i + 1] = clamp(Math.round(g), 0, 255);
      data[i + 2] = clamp(Math.round(b), 0, 255);
    }
  }

  async function applyColorAdjustments(blob) {
    const dirty = controls.some(([key]) => Number(state.settings[key]) !== 0);
    if (!dirty) return blob;
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.filter = colorFilter(state.settings);
    ctx.drawImage(bitmap, 0, 0);
    ctx.filter = "none";
    bitmap.close();

    const stripeHeight = Math.max(64, Math.min(512, Math.floor(8_000_000 / Math.max(1, canvas.width))));
    for (let y = 0; y < canvas.height; y += stripeHeight) {
      const height = Math.min(stripeHeight, canvas.height - y);
      const image = ctx.getImageData(0, y, canvas.width, height);
      transformPixelData(image.data, state.settings);
      ctx.putImageData(image, 0, y);
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    let output = await new Promise((resolve, reject) => canvas.toBlob((result) => result ? resolve(result) : reject(new Error("La correction couleur a échoué.")), "image/png"));
    if (window.PrintellyPrintExport && typeof window.PrintellyPrintExport.embedPngDpi === "function") {
      output = await window.PrintellyPrintExport.embedPngDpi(output, selectedDpi());
    }
    return output;
  }

  function directDownload(blob, name) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = name || "printelly-studio-ai.png";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  async function captureNativeExport(downloadButton, interceptionHandler) {
    let capturedBlob = null;
    let capturedName = "printelly-studio-ai.png";
    const originalCreateObjectURL = URL.createObjectURL;
    const originalAnchorClick = HTMLAnchorElement.prototype.click;
    URL.createObjectURL = function (value) {
      if (value instanceof Blob && value.type === "image/png") capturedBlob = value;
      return originalCreateObjectURL.call(URL, value);
    };
    HTMLAnchorElement.prototype.click = function () {
      if (this.download) {
        capturedName = this.download || capturedName;
        return;
      }
      return originalAnchorClick.call(this);
    };
    downloadButton.removeEventListener("click", interceptionHandler, true);
    try {
      downloadButton.click();
      const started = Date.now();
      while (!capturedBlob && Date.now() - started < 30000) await new Promise((resolve) => setTimeout(resolve, 80));
      if (!capturedBlob) throw new Error("Le PNG final n’a pas pu être récupéré.");
      return { blob: capturedBlob, name: capturedName };
    } finally {
      URL.createObjectURL = originalCreateObjectURL;
      HTMLAnchorElement.prototype.click = originalAnchorClick;
      downloadButton.addEventListener("click", interceptionHandler, true);
    }
  }

  function setExportBusy(busy, text) {
    state.busy = busy;
    const add = $("brAddToOrder");
    const download = $("brDownload");
    if (add) {
      add.disabled = busy || !download || download.disabled;
      add.classList.toggle("is-loading", busy);
      add.textContent = busy ? (text || "PRÉPARATION…") : "AJOUTER À LA COMMANDE";
    }
  }

  function installExportBridge() {
    const download = $("brDownload");
    const add = $("brAddToOrder");
    if (!download || !add || add.dataset.proBridge === "1") return;
    add.hidden = false;
    add.dataset.proBridge = "1";
    add.textContent = "AJOUTER À LA COMMANDE";

    const handleDownload = async (event) => {
      if (state.busy || download.disabled) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setExportBusy(true, "EXPORT HAUTE RÉSOLUTION…");
      setMessage("Application des retouches sur le PNG original…", "");
      try {
        const native = await captureNativeExport(download, handleDownload);
        const output = await applyColorAdjustments(native.blob);
        const report = await inspectBlob(output);
        renderPreflight(report);
        directDownload(output, native.name);
        setMessage("PNG transparent professionnel téléchargé.", "success");
      } catch (error) {
        setMessage(error.message || "Export impossible.", "error");
      } finally {
        setExportBusy(false);
        download.disabled = false;
      }
    };

    const handleAdd = async (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (state.busy || download.disabled) return;
      setExportBusy(true, "AJOUT À LA COMMANDE…");
      markWorkflow("order");
      setMessage("Préparation sécurisée du fichier pour votre nouvelle commande…", "");
      try {
        const native = await captureNativeExport(download, handleDownload);
        const output = await applyColorAdjustments(native.blob);
        const report = await inspectBlob(output);
        renderPreflight(report);
        if (report.state === "bad") throw new Error("Le contrôle avant impression détecte un problème bloquant. Corrigez-le avant d’ajouter le fichier.");
        const handoffId = crypto.randomUUID();
        const widthValue = Number($("brPrintWidth") && $("brPrintWidth").value) || 10;
        const heightValue = Number($("brPrintHeight") && $("brPrintHeight").value) || 10;
        const record = {
          id: PENDING_ID,
          handoffId,
          blob: output,
          name: native.name,
          type: "image/png",
          size: output.size,
          widthPx: report.width,
          heightPx: report.height,
          widthCm: widthValue,
          heightCm: heightValue,
          dpi: report.dpi,
          qualityState: report.state,
          qualityLabel: report.label,
          qualityIssues: report.issues,
          colorSettings: copySettings(),
          createdAt: new Date().toISOString(),
          source: "studio-ai-pro"
        };
        await saveHandoff(record);
        localStorage.setItem("printellyStudioPendingOrder", JSON.stringify({ id: handoffId, createdAt: record.createdAt }));
        setMessage("Fichier prêt. Ouverture de « Photos à organiser »…", "success");
        window.location.href = "../?view=new-order&studio=1";
      } catch (error) {
        setMessage(error.message || "Impossible d’ajouter le fichier à la commande.", "error");
        setExportBusy(false);
        download.disabled = false;
      }
    };

    download.addEventListener("click", handleDownload, true);
    add.addEventListener("click", handleAdd, true);

    const observer = new MutationObserver(() => {
      if (!state.busy) add.disabled = download.disabled;
      if (!download.disabled) {
        markWorkflow("remove");
        const runQuality = $("brRunQuality");
        if (runQuality && !runQuality.disabled && !runQuality.dataset.autoTriggered) {
          runQuality.dataset.autoTriggered = "1";
          setTimeout(() => runQuality.click(), 250);
        }
      }
    });
    observer.observe(download, { attributes: true, attributeFilter: ["disabled"] });
  }

  function installProfessionalShortcuts() {
    document.addEventListener("keydown", (event) => {
      const target = event.target;
      if (target && target.matches && target.matches("input,textarea,select")) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        const button = event.shiftKey ? $("brColorRedo") : $("brColorUndo");
        if (button && !button.disabled) button.click();
      }
      if ((event.ctrlKey || event.metaKey) && event.key === "0") {
        event.preventDefault();
        const fit = $("brFit");
        if (fit) fit.click();
      }
      if (event.key.toLowerCase() === "b") {
        state.compare = !state.compare;
        applyPreviewFilter();
      }
    });
  }

  function boot() {
    if (!$("bgRemoverView") || !$("brCanvas") || !$("brDownload")) return;
    injectWorkflow();
    forceProfessionalMode();
    addColorControls();
    addQualityEnhancements();
    installExportBridge();
    installProfessionalShortcuts();
    document.body.classList.add("br-pro-upgraded");

    const dropzone = $("brDropzone");
    if (dropzone) {
      dropzone.addEventListener("click", () => markWorkflow("import"));
      dropzone.addEventListener("drop", () => markWorkflow("import"));
    }
  }

  if (document.readyState === "complete") setTimeout(boot, 0);
  else window.addEventListener("load", () => setTimeout(boot, 0), { once: true });
})();
