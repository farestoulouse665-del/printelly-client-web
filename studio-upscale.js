"use strict";
(function () {
  const DB_NAME = "printelly-studio-handoff-v1";
  const STORE_NAME = "handoffs";
  const PENDING_ID = "pending-order-file";
  const MAX_4K_EDGE = 3840;
  const $ = (id) => document.getElementById(id);
  const state = { busy: false, blob: null, name: "", width: 0, height: 0, sourceWidth: 0, sourceHeight: 0 };

  const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));
  const canvasBlob = (canvas) => new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Impossible de générer le PNG 4K.")), "image/png"));

  function setMessage(text, type) {
    const message = $("brMessage");
    if (!message) return;
    message.textContent = text || "";
    message.className = "br-message" + (type ? " " + type : "");
  }

  function setStatus(text, stateName) {
    const status = $("studioUpscaleStatus");
    if (!status) return;
    status.textContent = text;
    status.dataset.state = stateName || "waiting";
  }

  function setBusy(busy, text) {
    state.busy = busy;
    ["studioUpscalePrepare", "studioUpscaleDownload", "studioUpscaleOrder"].forEach((id) => {
      const button = $(id);
      if (button) button.disabled = busy || ((id !== "studioUpscalePrepare") && !state.blob);
    });
    const prepare = $("studioUpscalePrepare");
    if (prepare) prepare.textContent = busy ? (text || "TRAITEMENT 4K…") : "PRÉPARER LE 4K";
  }

  function outputName(name) {
    const clean = String(name || "printelly-studio-ai.png").replace(/\.png$/i, "");
    return clean.replace(/-4k$/i, "") + "-4k.png";
  }

  async function captureProcessedPng() {
    const download = $("brDownload");
    if (!download || download.disabled) throw new Error("Terminez d’abord le détourage.");
    let captured = null;
    let capturedName = "printelly-studio-ai.png";
    const nativeCreate = URL.createObjectURL;
    const nativeClick = HTMLAnchorElement.prototype.click;
    URL.createObjectURL = function (value) {
      if (value instanceof Blob && value.type === "image/png") captured = value;
      return nativeCreate.call(URL, value);
    };
    HTMLAnchorElement.prototype.click = function () {
      if (this.download) {
        capturedName = this.download || capturedName;
        return;
      }
      return nativeClick.call(this);
    };
    try {
      download.click();
      const started = Date.now();
      let stableSince = 0;
      let lastSize = -1;
      while (Date.now() - started < 45000) {
        await new Promise((resolve) => setTimeout(resolve, 120));
        if (captured && captured.size === lastSize && !download.disabled) {
          if (!stableSince) stableSince = Date.now();
          if (Date.now() - stableSince > 350) break;
        } else {
          stableSince = 0;
          lastSize = captured ? captured.size : -1;
        }
      }
      if (!captured) throw new Error("Le PNG final n’a pas pu être récupéré.");
      return { blob: captured, name: capturedName };
    } finally {
      URL.createObjectURL = nativeCreate;
      HTMLAnchorElement.prototype.click = nativeClick;
    }
  }

  function targetDimensions(width, height, mode) {
    const maxEdge = Math.max(width, height);
    let scale = 1;
    if (mode === "2x") scale = Math.min(2, MAX_4K_EDGE / maxEdge);
    else if (mode === "4k") scale = MAX_4K_EDGE / maxEdge;
    const outputWidth = Math.max(1, Math.round(width * scale));
    const outputHeight = Math.max(1, Math.round(height * scale));
    return { width: outputWidth, height: outputHeight, scale };
  }

  function makeCanvas(width, height) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }

  async function progressiveResize(bitmap, targetWidth, targetHeight) {
    let source = makeCanvas(bitmap.width, bitmap.height);
    let ctx = source.getContext("2d", { alpha: true });
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.clearRect(0, 0, source.width, source.height);
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();

    if (source.width > targetWidth || source.height > targetHeight) {
      const reduced = makeCanvas(targetWidth, targetHeight);
      ctx = reduced.getContext("2d", { alpha: true });
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.clearRect(0, 0, targetWidth, targetHeight);
      ctx.drawImage(source, 0, 0, targetWidth, targetHeight);
      source.width = 1;
      source.height = 1;
      await nextFrame();
      return reduced;
    }

    while (source.width < targetWidth || source.height < targetHeight) {
      const nextWidth = Math.min(targetWidth, Math.max(source.width + 1, Math.round(source.width * 1.75)));
      const nextHeight = Math.min(targetHeight, Math.max(source.height + 1, Math.round(source.height * 1.75)));
      const next = makeCanvas(nextWidth, nextHeight);
      ctx = next.getContext("2d", { alpha: true });
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.clearRect(0, 0, nextWidth, nextHeight);
      ctx.drawImage(source, 0, 0, nextWidth, nextHeight);
      source.width = 1;
      source.height = 1;
      source = next;
      await nextFrame();
    }
    return source;
  }

  async function edgeAwareSharpen(canvas, strength) {
    const amount = Math.max(0, Math.min(1, Number(strength) / 100));
    if (amount <= 0) return canvas;
    const ctx = canvas.getContext("2d", { willReadFrequently: true, alpha: true });
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = image.data;
    const source = new Uint8ClampedArray(data);
    const width = canvas.width;
    const height = canvas.height;
    const gain = 1.35 * amount;
    const threshold = 2.5;
    const luma = (index) => source[index] * 0.2126 + source[index + 1] * 0.7152 + source[index + 2] * 0.0722;

    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const i = (y * width + x) * 4;
        const alpha = source[i + 3];
        if (alpha < 48) continue;
        const neighbor = (luma(i - 4) + luma(i + 4) + luma(i - width * 4) + luma(i + width * 4)) / 4;
        const delta = luma(i) - neighbor;
        if (Math.abs(delta) < threshold) continue;
        const edgeProtection = Math.min(1, alpha / 180);
        const correction = delta * gain * edgeProtection;
        data[i] = Math.max(0, Math.min(255, Math.round(source[i] + correction)));
        data[i + 1] = Math.max(0, Math.min(255, Math.round(source[i + 1] + correction)));
        data[i + 2] = Math.max(0, Math.min(255, Math.round(source[i + 2] + correction)));
      }
      if (y % 72 === 0) await nextFrame();
    }
    ctx.putImageData(image, 0, 0);
    return canvas;
  }

  async function upscaleBlob(blob, mode, sharpness) {
    const bitmap = await createImageBitmap(blob);
    const sourceWidth = bitmap.width;
    const sourceHeight = bitmap.height;
    const target = targetDimensions(sourceWidth, sourceHeight, mode);
    const canvas = await progressiveResize(bitmap, target.width, target.height);
    await edgeAwareSharpen(canvas, sharpness);
    let output = await canvasBlob(canvas);
    const dpi = Number($("brExportDpi") && $("brExportDpi").value) || 300;
    if (window.PrintellyPrintExport && typeof window.PrintellyPrintExport.embedPngDpi === "function") {
      output = await window.PrintellyPrintExport.embedPngDpi(output, dpi);
    }
    return { blob: output, width: target.width, height: target.height, sourceWidth, sourceHeight, scale: target.scale, dpi };
  }

  async function prepare() {
    if (state.busy) return;
    setBusy(true, "CAPTURE DU PNG…");
    setStatus("ANALYSE…", "working");
    setMessage("Récupération du PNG final puis upscale local haute qualité…", "");
    try {
      const native = await captureProcessedPng();
      setBusy(true, "UPSCALE 4K…");
      const mode = $("studioUpscaleMode").value;
      const sharpness = Number($("studioUpscaleSharpness").value) || 0;
      const output = await upscaleBlob(native.blob, mode, sharpness);
      state.blob = output.blob;
      state.name = outputName(native.name);
      state.width = output.width;
      state.height = output.height;
      state.sourceWidth = output.sourceWidth;
      state.sourceHeight = output.sourceHeight;
      $("studioUpscaleDimensions").textContent = `${output.width} × ${output.height} px`;
      $("studioUpscaleScale").textContent = output.scale > 1.01 ? `×${output.scale.toFixed(2)}` : output.scale < .99 ? `×${output.scale.toFixed(2)} • limité 4K` : "Original optimisé";
      $("studioUpscaleSize").textContent = formatBytes(output.blob.size);
      setStatus(output.width >= 3840 || output.height >= 3840 ? "4K PRÊT" : "HAUTE QUALITÉ", "good");
      setMessage(`Upscale terminé : ${output.width} × ${output.height} px, alpha PNG conservé.`, "success");
      window.dispatchEvent(new CustomEvent("printelly:studio-upscale-ready", { detail: output }));
    } catch (error) {
      state.blob = null;
      setStatus("ÉCHEC", "bad");
      setMessage(error.message || "Upscale impossible.", "error");
    } finally {
      setBusy(false);
    }
  }

  function formatBytes(value) {
    const size = Number(value) || 0;
    if (size < 1024) return size + " o";
    if (size < 1024 * 1024) return (size / 1024).toFixed(1) + " Kio";
    return (size / 1024 / 1024).toFixed(1) + " Mio";
  }

  function downloadPrepared() {
    if (!state.blob) return;
    const url = URL.createObjectURL(state.blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = state.name || "printelly-studio-ai-4k.png";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    setMessage("PNG 4K téléchargé.", "success");
  }

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
    });
    db.close();
  }

  async function addPreparedToOrder() {
    if (!state.blob || state.busy) return;
    setBusy(true, "AJOUT 4K…");
    try {
      const handoffId = crypto.randomUUID();
      const widthCm = Number($("brPrintWidth") && $("brPrintWidth").value) || 10;
      const heightCm = Number($("brPrintHeight") && $("brPrintHeight").value) || 10;
      const dpi = Number($("brExportDpi") && $("brExportDpi").value) || 300;
      const record = {
        id: PENDING_ID,
        handoffId,
        blob: state.blob,
        name: state.name,
        type: "image/png",
        size: state.blob.size,
        widthPx: state.width,
        heightPx: state.height,
        widthCm,
        heightCm,
        dpi,
        qualityState: "good",
        qualityLabel: "UPSCALE 4K PRÊT",
        qualityIssues: [],
        createdAt: new Date().toISOString(),
        source: "studio-ai-upscale-4k",
        upscale: { sourceWidth: state.sourceWidth, sourceHeight: state.sourceHeight, outputWidth: state.width, outputHeight: state.height }
      };
      await saveHandoff(record);
      localStorage.setItem("printellyStudioPendingOrder", JSON.stringify({ id: handoffId, createdAt: record.createdAt }));
      setMessage("PNG 4K prêt. Ouverture de « Photos à organiser »…", "success");
      window.location.href = "../?view=new-order&studio=1";
    } catch (error) {
      setMessage(error.message || "Impossible d’ajouter le PNG 4K à la commande.", "error");
      setBusy(false);
    }
  }

  function injectPanel() {
    if ($("studioUpscalePanel")) return;
    const quality = $("brQualityPanel");
    const left = $("brLeftControls");
    if (!left) return;
    const panel = document.createElement("section");
    panel.id = "studioUpscalePanel";
    panel.className = "br-control-section studio-upscale-panel";
    panel.innerHTML = `
      <div class="br-section-head"><span>05</span><div><h3>Upscale & qualité 4K</h3><p>Agrandissement local multi-passes, netteté adaptative et alpha protégé</p></div></div>
      <div class="studio-upscale-head"><div><span>AMÉLIORATION HAUTE RÉSOLUTION</span><strong>Préparer une version jusqu’à 4K</strong><small>Augmente les dimensions et améliore la lisibilité. Les détails absents de la source ne peuvent pas être recréés fidèlement sans modèle génératif.</small></div><b id="studioUpscaleStatus" data-state="waiting">EN ATTENTE</b></div>
      <div class="studio-upscale-settings">
        <label class="br-api-field"><span>Cible</span><select id="studioUpscaleMode"><option value="4k" selected>4K — bord long 3840 px</option><option value="2x">2× — limité à 4K</option><option value="original">Dimensions originales + netteté</option></select></label>
        <label class="br-range"><span>Netteté adaptative <output id="studioUpscaleSharpnessValue">28 %</output></span><input id="studioUpscaleSharpness" type="range" min="0" max="65" value="28"><small>Renforce les contours visibles sans modifier le canal alpha.</small></label>
      </div>
      <div class="studio-upscale-metrics"><span><b id="studioUpscaleDimensions">—</b><small>Sortie</small></span><span><b id="studioUpscaleScale">—</b><small>Échelle</small></span><span><b id="studioUpscaleSize">—</b><small>Poids PNG</small></span></div>
      <div class="studio-upscale-actions"><button id="studioUpscalePrepare" class="primary" type="button">PRÉPARER LE 4K</button><button id="studioUpscaleDownload" class="secondary" type="button" disabled>TÉLÉCHARGER 4K</button><button id="studioUpscaleOrder" class="secondary" type="button" disabled>AJOUTER 4K À LA COMMANDE</button></div>
      <p class="studio-upscale-note">Traitement local dans le navigateur : aucun nouveau crédit Studio AI n’est consommé.</p>`;
    if (quality && quality.parentElement === left) left.insertBefore(panel, quality);
    else left.appendChild(panel);

    $("studioUpscaleSharpness").addEventListener("input", (event) => { $("studioUpscaleSharpnessValue").textContent = event.target.value + " %"; state.blob = null; setBusy(false); setStatus("À REFAIRE", "waiting"); });
    $("studioUpscaleMode").addEventListener("change", () => { state.blob = null; setBusy(false); setStatus("À REFAIRE", "waiting"); });
    $("studioUpscalePrepare").addEventListener("click", prepare);
    $("studioUpscaleDownload").addEventListener("click", downloadPrepared);
    $("studioUpscaleOrder").addEventListener("click", addPreparedToOrder);
  }

  function boot() {
    if (!$("bgRemoverView")) return;
    injectPanel();
    window.PrintellyStudioUpscale = { prepare, upscaleBlob, targetDimensions };
  }

  function wait(attempt) {
    if ($("brLeftControls") && $("brDownload") && $("brQualityPanel")) return boot();
    if (attempt > 120) return boot();
    setTimeout(() => wait(attempt + 1), 50);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => wait(0), { once: true });
  else wait(0);
})();
