"use strict";
(function () {
  const DB_NAME = "printelly-studio-handoff-v1";
  const STORE_NAME = "handoffs";
  const PENDING_ID = "pending-order-file";
  const imported = new Set();

  function injectStyles() {
    if (document.getElementById("studioOrderBridgeStyles")) return;
    const style = document.createElement("style");
    style.id = "studioOrderBridgeStyles";
    style.textContent = `
      .studio-order-banner{margin:0 0 18px;padding:16px 18px;border:1px solid rgba(25,230,162,.28);border-radius:16px;background:linear-gradient(135deg,rgba(25,230,162,.1),rgba(37,183,255,.06));display:flex;align-items:center;justify-content:space-between;gap:14px}.studio-order-banner strong{display:block}.studio-order-banner span{display:block;margin-top:4px;color:#64748b;font-size:.82rem}.studio-order-banner b{padding:8px 10px;border-radius:999px;background:#0f766e;color:#ecfeff;font-size:.7rem;white-space:nowrap}
      .file-row.studio-ai-file{position:relative;display:grid;grid-template-columns:72px 1fr auto;align-items:center;gap:12px;border-color:rgba(25,230,162,.3);background:linear-gradient(135deg,rgba(25,230,162,.06),rgba(255,255,255,.02))}.studio-file-thumb{width:72px;height:72px;border-radius:12px;object-fit:contain;background:repeating-conic-gradient(#e5e7eb 0 25%,#fff 0 50%) 50%/14px 14px;border:1px solid rgba(148,163,184,.22)}.studio-file-badges{display:flex;flex-wrap:wrap;gap:6px;margin:5px 0}.studio-file-badges span{padding:4px 7px;border-radius:999px;background:rgba(25,230,162,.12);color:#047857;font-size:.64rem;font-weight:900}.studio-file-badges span.warn{background:rgba(247,184,75,.16);color:#a16207}.studio-file-badges span.bad{background:rgba(255,100,124,.16);color:#be123c}@media(max-width:620px){.studio-order-banner{align-items:flex-start;flex-direction:column}.file-row.studio-ai-file{grid-template-columns:58px 1fr auto}.studio-file-thumb{width:58px;height:58px}}
    `;
    document.head.appendChild(style);
  }

  function openDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: "id" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Stockage Studio AI indisponible."));
    });
  }

  async function readPending() {
    const db = await openDb();
    const value = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const request = tx.objectStore(STORE_NAME).get(PENDING_ID);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error || new Error("Lecture du fichier impossible."));
    });
    db.close();
    return value;
  }

  async function deletePending() {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).delete(PENDING_ID);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error || new Error("Nettoyage du transfert impossible."));
    });
    db.close();
  }

  function decorateFiles() {
    if (typeof state === "undefined" || !Array.isArray(state.files)) return;
    document.querySelectorAll("#filesEditor .file-row").forEach((row) => {
      const index = Number(row.dataset.i);
      const entry = state.files[index];
      if (!entry || !entry.file || !String(entry.file.type).startsWith("image/")) return;
      if (!entry.previewUrl) entry.previewUrl = URL.createObjectURL(entry.file);
      if (!row.querySelector(".studio-file-thumb")) {
        const image = document.createElement("img");
        image.className = "studio-file-thumb";
        image.src = entry.previewUrl;
        image.alt = "Aperçu de " + entry.file.name;
        row.insertBefore(image, row.firstChild);
      }
      if (entry.studioAI) {
        row.classList.add("studio-ai-file");
        const content = row.children[1] || row.firstElementChild;
        if (content && !content.querySelector(".studio-file-badges")) {
          const badges = document.createElement("div");
          badges.className = "studio-file-badges";
          const qualityClass = entry.qualityState === "warn" ? "warn" : entry.qualityState === "bad" ? "bad" : "";
          badges.innerHTML = `<span>OPTIMISÉ AVEC STUDIO AI</span><span class="${qualityClass}">${entry.qualityLabel || "PRÊT À IMPRIMER"}</span><span>${entry.dpi || 300} DPI</span>`;
          const name = content.querySelector(".file-name");
          if (name) name.insertAdjacentElement("afterend", badges);
          else content.prepend(badges);
        }
      }
    });
  }

  function installRenderDecorator() {
    if (typeof renderFiles !== "function" || renderFiles.__studioBridge) return false;
    const original = renderFiles;
    renderFiles = function () {
      original();
      decorateFiles();
    };
    renderFiles.__studioBridge = true;
    document.addEventListener("click", (event) => {
      const remove = event.target.closest && event.target.closest("[data-remove]");
      if (!remove || typeof state === "undefined") return;
      const entry = state.files[Number(remove.dataset.remove)];
      if (entry && entry.previewUrl) setTimeout(() => URL.revokeObjectURL(entry.previewUrl), 0);
    }, true);
    return true;
  }

  function showBanner(record) {
    const view = document.getElementById("newOrderView");
    if (!view) return;
    let banner = document.getElementById("studioOrderBanner");
    if (!banner) {
      banner = document.createElement("div");
      banner.id = "studioOrderBanner";
      banner.className = "studio-order-banner";
      const head = view.querySelector(".page-head");
      if (head) head.insertAdjacentElement("afterend", banner);
      else view.prepend(banner);
    }
    banner.innerHTML = `<div><strong>PNG Studio AI ajouté automatiquement</strong><span>${record.name} est déjà placé dans « Photos à organiser ». Indiquez la taille et la quantité, puis envoyez la commande.</span></div><b>${record.qualityLabel || "PRÊT À IMPRIMER"}</b>`;
  }

  function selectVisualMode() {
    if (typeof state === "undefined") return;
    state.mode = "visual";
    const visual = document.querySelector('input[name="orderMode"][value="visual"]');
    const ready = document.querySelector('input[name="orderMode"][value="ready"]');
    if (visual) visual.checked = true;
    if (ready) ready.checked = false;
    document.querySelectorAll(".mode-card").forEach((card) => card.classList.toggle("selected", Boolean(card.querySelector('input[value="visual"]'))));
    const input = document.getElementById("fileInput");
    if (input) input.accept = "image/jpeg,image/png";
  }

  async function importPending() {
    if (!localStorage.getItem("printellyStudioPendingOrder")) return false;
    if (typeof state === "undefined" || !state.session || typeof renderFiles !== "function" || typeof setView !== "function") return false;
    const record = await readPending();
    if (!record || !record.blob || !record.handoffId) {
      localStorage.removeItem("printellyStudioPendingOrder");
      return false;
    }
    if (imported.has(record.handoffId) || state.files.some((entry) => entry.studioHandoffId === record.handoffId)) return true;
    selectVisualMode();
    const file = new File([record.blob], record.name || "printelly-studio-ai.png", { type: "image/png", lastModified: Date.now() });
    const width = Number(record.widthCm) || 10;
    const ratio = record.widthPx && record.heightPx ? record.heightPx / record.widthPx : 1;
    const height = Number(record.heightCm) || Math.max(0.1, Math.round(width * ratio * 100) / 100);
    const entry = {
      id: typeof uuid === "function" ? uuid() : crypto.randomUUID(),
      file,
      width,
      height,
      quantity: 1,
      length: 1,
      copies: 1,
      rotation: true,
      previewUrl: URL.createObjectURL(file),
      studioAI: true,
      studioHandoffId: record.handoffId,
      qualityState: record.qualityState,
      qualityLabel: record.qualityLabel,
      qualityIssues: record.qualityIssues || [],
      dpi: record.dpi || 300,
      widthPx: record.widthPx,
      heightPx: record.heightPx,
      colorSettings: record.colorSettings || {}
    };
    state.files.push(entry);
    imported.add(record.handoffId);
    renderFiles();
    setView("new-order");
    showBanner(record);
    if (typeof toast === "function") toast("PNG Studio AI ajouté à la nouvelle commande.");
    await deletePending();
    localStorage.removeItem("printellyStudioPendingOrder");
    history.replaceState({}, "", location.pathname + "?view=new-order&studio=1");
    return true;
  }

  async function boot() {
    injectStyles();
    let attempts = 0;
    const timer = setInterval(async () => {
      attempts += 1;
      try {
        installRenderDecorator();
        const importedNow = await importPending();
        if (importedNow || !localStorage.getItem("printellyStudioPendingOrder") || attempts > 1800) clearInterval(timer);
      } catch (error) {
        console.warn("Transfert Studio AI vers commande:", error.message);
        if (attempts > 1800) clearInterval(timer);
      }
    }, 350);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
