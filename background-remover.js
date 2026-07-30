(function () {
  "use strict";

  var ui = {
    workspace: document.querySelector(".br-workspace"),
    leftControls: document.getElementById("brLeftControls"),
    rightControls: document.getElementById("brRightControls"),
    toggleLeft: document.getElementById("brToggleLeft"),
    toggleRight: document.getElementById("brToggleRight"),
    apiUrl: document.getElementById("brApiUrl"),
    apiStatus: document.getElementById("brApiStatus"),
    studioAccess: document.getElementById("brStudioAccess"),
    entitlementTitle: document.getElementById("brEntitlementTitle"),
    entitlementBadge: document.getElementById("brEntitlementBadge"),
    entitlementText: document.getElementById("brEntitlementText"),
    entitlementMeter: document.getElementById("brEntitlementMeter"),
    packDialog: document.getElementById("brPackDialog"),
    packDialogTitle: document.getElementById("brPackDialogTitle"),
    packDialogText: document.getElementById("brPackDialogText"),
    packList: document.getElementById("brPackList"),
    closePackDialog: document.getElementById("brClosePackDialog"),
    refreshEntitlement: document.getElementById("brRefreshEntitlement"),
    testApi: document.getElementById("brTestApi"),
    file: document.getElementById("brFileInput"),
    pick: document.getElementById("brPickFile"),
    drop: document.getElementById("brDropzone"),
    analyze: document.getElementById("brAnalyze"),
    cancel: document.getElementById("brCancel"),
    stages: document.getElementById("brStages"),
    feather: document.getElementById("brFeather"),
    featherValue: document.getElementById("brFeatherValue"),
    edge: document.getElementById("brEdge"),
    edgeValue: document.getElementById("brEdgeValue"),
    decontaminate: document.getElementById("brDecontaminate"),
    backgroundCleanup: document.getElementById("brBackgroundCleanup"),
    blackBackgroundMode: document.getElementById("brBlackBackgroundMode"),
    removeHaze: document.getElementById("brRemoveHaze"),
    protectDetails: document.getElementById("brProtectDetails"),
    useBackgroundColor: document.getElementById("brUseBackgroundColor"),
    backgroundColor: document.getElementById("brBackgroundColor"),
    removalMenu: document.getElementById("brRemovalMenu"),
    removalMethod: document.getElementById("brRemovalMethod"),
    targetColor: document.getElementById("brTargetColor"),
    pickColor: document.getElementById("brPickColor"),
    colorTolerance: document.getElementById("brColorTolerance"),
    colorToleranceValue: document.getElementById("brColorToleranceValue"),
    magicTolerance: document.getElementById("brMagicTolerance"),
    magicToleranceValue: document.getElementById("brMagicToleranceValue"),
    removalHint: document.getElementById("brRemovalHint"),
    removalConnectivity: document.getElementById("brRemovalConnectivity"),
    removalSafety: document.getElementById("brRemovalSafety"),
    removalSelectionCount: document.getElementById("brRemovalSelectionCount"),
    previewRemoval: document.getElementById("brPreviewRemoval"),
    applyRemoval: document.getElementById("brApplyRemoval"),
    cancelRemoval: document.getElementById("brCancelRemoval"),
    paletteMenu: document.getElementById("brPaletteMenu"),
    paletteCount: document.getElementById("brPaletteCount"),
    paletteMetrics: document.getElementById("brPaletteMetrics"),
    paletteWarnings: document.getElementById("brPaletteWarnings"),
    analyzeColors: document.getElementById("brAnalyzeColors"),
    paletteList: document.getElementById("brPaletteList"),
    showAllColors: document.getElementById("brShowAllColors"),
    previewColorRemoval: document.getElementById("brPreviewColorRemoval"),
    deleteSelectedColor: document.getElementById("brDeleteSelectedColor"),
    brush: document.getElementById("brBrush"),
    brushValue: document.getElementById("brBrushValue"),
    hardness: document.getElementById("brHardness"),
    hardnessValue: document.getElementById("brHardnessValue"),
    opacity: document.getElementById("brOpacity"),
    opacityValue: document.getElementById("brOpacityValue"),
    undo: document.getElementById("brUndo"),
    redo: document.getElementById("brRedo"),
    canvas: document.getElementById("brCanvas"),
    shell: document.getElementById("brCanvasShell"),
    canvasFullscreen: document.getElementById("brCanvasFullscreen"),
    empty: document.getElementById("brPreviewEmpty"),
    cursor: document.getElementById("brBrushCursor"),
    zoomOut: document.getElementById("brZoomOut"),
    zoomIn: document.getElementById("brZoomIn"),
    zoomValue: document.getElementById("brZoomValue"),
    fit: document.getElementById("brFit"),
    previewColor: document.getElementById("brPreviewColor"),
    splitControl: document.getElementById("brSplitControl"),
    split: document.getElementById("brSplit"),
    splitValue: document.getElementById("brSplitValue"),
    imageMeta: document.getElementById("brImageMeta"),
    resultInfo: document.getElementById("brResultInfo"),
    backgroundInfo: document.getElementById("brBackgroundInfo"),
    qualityInfo: document.getElementById("brQualityInfo"),
    reset: document.getElementById("brReset"),
    download: document.getElementById("brDownload"),
    add: document.getElementById("brAddToOrder"),
    progress: document.getElementById("brProgress"),
    message: document.getElementById("brMessage"),
    qualityPanel: document.getElementById("brQualityPanel"),
    qualityScore: document.getElementById("brQualityScore"),
    qualityVerdict: document.getElementById("brQualityVerdict"),
    qualityMetrics: document.getElementById("brQualityMetrics"),
    downloadQualityReport: document.getElementById("brDownloadQualityReport"),
    printWidth: document.getElementById("brPrintWidth"),
    printHeight: document.getElementById("brPrintHeight"),
    printUnit: document.getElementById("brPrintUnit"),
    exportDpi: document.getElementById("brExportDpi"),
    customDpiField: document.getElementById("brCustomDpiField"),
    customDpi: document.getElementById("brCustomDpi"),
    dpiMode: document.getElementById("brDpiMode"),
    lockPrintRatio: document.getElementById("brLockPrintRatio"),
    printSummary: document.getElementById("brPrintSummary"),
    printQuality: document.getElementById("brPrintQuality"),
    printPixels: document.getElementById("brPrintPixels"),
    effectiveDpi: document.getElementById("brEffectiveDpi"),
    printBadge: document.getElementById("brPrintBadge"),
    microLimit: document.getElementById("brMicroLimit"),
    runQuality: document.getElementById("brRunQuality"),
    nextIssue: document.getElementById("brNextIssue"),
    cleanMicro: document.getElementById("brCleanMicro"),
    qualitySummary: document.getElementById("brQualitySummary"),
    qualityIssues: document.getElementById("brQualityIssues"),
    qualityCertificate: document.getElementById("brQualityCertificate")
  };

  if (!ui.canvas) return;

  function setupProfessionalStudio() {
    if (!ui.workspace || !ui.leftControls || !ui.rightControls) return;

    var correctionSection = ui.removalMenu ? ui.removalMenu.closest(".br-control-section") : null;
    var exportPanel = document.querySelector(".br-export-panel");
    if (correctionSection) correctionSection.setAttribute("data-br-pro-only", "");

    function setStudioMode(mode, persist) {
      mode = mode === "pro" ? "pro" : "simple";
      ui.workspace.dataset.studioMode = mode;
      document.querySelectorAll("[data-br-studio-mode]").forEach(function (button) {
        var active = button.dataset.brStudioMode === mode;
        button.classList.toggle("active", active);
        button.setAttribute("aria-pressed", active ? "true" : "false");
      });
      if (persist !== false) {
        try { localStorage.setItem("printellyStudioMode", mode); } catch (_) {}
      }
      window.requestAnimationFrame(function () { window.dispatchEvent(new Event("resize")); });
    }

    var savedMode = "simple";
    try { savedMode = localStorage.getItem("printellyStudioMode") || "simple"; } catch (_) {}
    setStudioMode(savedMode, false);
    document.querySelectorAll("[data-br-studio-mode]").forEach(function (button) {
      button.addEventListener("click", function () { setStudioMode(button.dataset.brStudioMode); });
    });
    [correctionSection, ui.qualityPanel, exportPanel].forEach(function (panel) {
      if (panel) ui.rightControls.appendChild(panel);
    });

    function setPanel(name, visible, persist) {
      var isLeft = name === "left";
      var panel = isLeft ? ui.leftControls : ui.rightControls;
      var button = isLeft ? ui.toggleLeft : ui.toggleRight;
      if (!panel || !button) return;
      ui.workspace.classList.toggle("br-" + name + "-collapsed", !visible);
      panel.setAttribute("aria-hidden", visible ? "false" : "true");
      button.setAttribute("aria-pressed", visible ? "true" : "false");
      button.classList.toggle("active", visible);
      if (persist !== false) {
        try { localStorage.setItem("printellyStudio" + (isLeft ? "Left" : "Right"), visible ? "1" : "0"); } catch (_) {}
      }
      window.requestAnimationFrame(function () {
        window.dispatchEvent(new Event("resize"));
      });
    }

    function savedPanel(name) {
      try {
        var value = localStorage.getItem("printellyStudio" + (name === "left" ? "Left" : "Right"));
        return value === null ? true : value === "1";
      } catch (_) {
        return true;
      }
    }

    setPanel("left", savedPanel("left"), false);
    setPanel("right", savedPanel("right"), false);

    ui.toggleLeft.addEventListener("click", function () {
      setPanel("left", ui.workspace.classList.contains("br-left-collapsed"));
    });
    ui.toggleRight.addEventListener("click", function () {
      setPanel("right", ui.workspace.classList.contains("br-right-collapsed"));
    });

    document.addEventListener("keydown", function (event) {
      if (!event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key === "[") {
        event.preventDefault();
        ui.toggleLeft.click();
      } else if (event.key === "]") {
        event.preventDefault();
        ui.toggleRight.click();
      }
    });
  }

  setupProfessionalStudio();

  function setExpandedWorkspace(expanded) {
    document.body.classList.toggle("br-studio-active", expanded);
    if (ui.canvasFullscreen) {
      ui.canvasFullscreen.classList.toggle("active", expanded);
      ui.canvasFullscreen.setAttribute("aria-pressed", expanded ? "true" : "false");
      ui.canvasFullscreen.innerHTML = expanded
        ? '<span aria-hidden="true">↙</span> RÉDUIRE'
        : '<span aria-hidden="true">⛶</span> PLEIN ÉCRAN';
    }
    window.requestAnimationFrame(function () {
      window.requestAnimationFrame(function () {
        if (typeof fitPreview === "function") fitPreview();
      });
    });
  }

  if (ui.canvasFullscreen) {
    ui.canvasFullscreen.addEventListener("click", function () {
      setExpandedWorkspace(!document.body.classList.contains("br-studio-active"));
    });
  }

  var remover = {
    file: null,
    sourceImage: null,
    sourceUrl: "",
    resultImage: null,
    resultUrl: "",
    resultBlob: null,
    originalPreview: document.createElement("canvas"),
    originalPixels: null,
    sourceAlpha: null,
    serverPixels: null,
    baseMask: null,
    currentMask: null,
    previewWidth: 0,
    previewHeight: 0,
    mode: "auto",
    tool: "pan",
    view: "result",
    background: "checker",
    zoom: 1,
    panX: 0,
    panY: 0,
    actions: [],
    redo: [],
    pendingSelection: null,
    pendingSelectionCount: 0,
    manualGuide: null,
    paletteColors: [],
    paletteAssignments: null,
    paletteHidden: {},
    paletteSelectedIndex: -1,
    paletteProtected: {},
    qualityReport: null,
    qualityIssueIndex: -1,
    multiPointMode: false,
    drawing: false,
    panning: false,
    activeStroke: null,
    lastClientX: 0,
    lastClientY: 0,
    abortController: null,
    processing: false,
    entitlement: { checked: false, accessAllowed: false, accessReason: "checking", available: 0, trialAvailable: 0, paidAvailable: 0, plan: "" },
    entitlementPromise: null,
    entitlementTimer: null,
    progressTimers: [],
    outputName: "image-sans-fond.png",
    printUnit: "cm"
  };

  function apiBase() {
    return (ui.apiUrl.value || "").trim().replace(/\/+$/, "");
  }

  function apiEndpoint(path) {
    return apiBase() + path;
  }

  function initialApiUrl() {
    if (window.PrintellyBackgroundApi && window.PrintellyBackgroundApi.productionEndpoint) {
      return window.PrintellyBackgroundApi.productionEndpoint;
    }
    return "https://jitxplfujyypfepiajgz.supabase.co/functions/v1/printelly-background-removal";
  }

  function setMessage(text, type) {
    ui.message.textContent = text || "";
    ui.message.className = "br-message" + (type ? " " + type : "");
  }

  function setApiState(text, stateName) {
    ui.apiStatus.textContent = text;
    ui.apiStatus.dataset.state = stateName;
  }

  function updateAnalyzeButton() {
    if (!ui.analyze) return;
    var locked = remover.entitlement.checked && !remover.entitlement.accessAllowed;
    ui.analyze.disabled = remover.processing || !remover.file || !remover.entitlement.checked;
    ui.analyze.classList.toggle("is-locked", locked);
    ui.analyze.setAttribute("aria-disabled", locked ? "true" : "false");
    if (!remover.entitlement.checked) ui.analyze.textContent = "VÉRIFICATION DE L’ACCÈS…";
    else if (locked) ui.analyze.textContent = "🔒 CHOISIR UN PACK STUDIO AI";
    else if (remover.entitlement.trialAvailable > 0) ui.analyze.textContent = "ESSAYER GRATUITEMENT — 1 CRÉDIT";
    else ui.analyze.textContent = "SUPPRIMER LE FOND — " + remover.entitlement.available + " CRÉDIT" + (remover.entitlement.available === 1 ? "" : "S");
  }

  function renderEntitlement(data) {
    var quota = data && data.quota ? data.quota : {};
    var access = data && data.entitlement ? data.entitlement : quota;
    var available = Math.max(0, Number(quota.available || 0));
    var reason = String(access.access_reason || quota.access_reason || "trial_exhausted");
    var trial = Math.max(0, Number(access.trial_available || quota.trial_available || 0));
    var paid = Math.max(0, Number(access.paid_available || quota.paid_available || 0));
    remover.entitlement = {
      checked: true,
      accessAllowed: access.access_allowed !== false && available > 0,
      accessReason: reason,
      available: available,
      trialAvailable: trial,
      paidAvailable: paid,
      plan: String(quota.plan || "")
    };
    var state = remover.entitlement.accessAllowed ? (trial > 0 ? "trial" : "active") : "locked";
    if (ui.studioAccess) ui.studioAccess.dataset.state = state;
    if (ui.entitlementBadge) {
      ui.entitlementBadge.textContent = state === "trial" ? "ESSAI GRATUIT" : state === "active" ? "PACK ACTIF" : "ACCÈS BLOQUÉ";
    }
    if (ui.entitlementTitle) {
      ui.entitlementTitle.textContent = state === "trial"
        ? "1 détourage gratuit disponible"
        : state === "active"
          ? (remover.entitlement.plan || "Studio AI") + " • " + available + " crédit" + (available === 1 ? "" : "s")
          : "Essai gratuit terminé";
    }
    if (ui.entitlementText) {
      ui.entitlementText.textContent = state === "trial"
        ? "Le résultat valide consommera votre unique essai. Un échec technique restitue automatiquement le crédit."
        : state === "active"
          ? "Votre abonnement validé par l’administration est actif. Les droits sont synchronisés automatiquement."
          : "Le détourage est verrouillé. Choisissez un pack ; le Studio se débloquera dès sa validation par l’administration.";
    }
    if (ui.entitlementMeter) ui.entitlementMeter.style.width = state === "locked" ? "0%" : state === "trial" ? "100%" : Math.min(100, Math.max(8, available * 10)) + "%";
    updateAnalyzeButton();
  }

  async function refreshEntitlement(silent) {
    if (remover.entitlementPromise) return remover.entitlementPromise;
    remover.entitlementPromise = (async function () {
      if (!silent) setApiState("Vérification…", "checking");
      try {
        if (!window.PrintellyBackgroundApi) throw new Error("Client API non chargé.");
        var data = await window.PrintellyBackgroundApi.health(apiBase());
        renderEntitlement(data);
        if (!data.model_loaded) {
          setApiState("PhotoRoom non prêt", "error");
          if (!silent) setMessage(data.status || "Le service PhotoRoom n’est pas disponible.", "warning");
          return false;
        }
        setApiState("PhotoRoom prêt • Cloud", "ready");
        if (!silent) {
          setMessage(
            remover.entitlement.accessAllowed
              ? "Accès Studio AI vérifié côté serveur. " + remover.entitlement.available + " crédit" + (remover.entitlement.available === 1 ? "" : "s") + " disponible" + (remover.entitlement.available === 1 ? "" : "s") + "."
              : "Votre essai est terminé. Choisissez un pack pour continuer.",
            remover.entitlement.accessAllowed ? "success" : "warning"
          );
        }
        return remover.entitlement.accessAllowed;
      } catch (error) {
        remover.entitlement = {
          checked: true, accessAllowed: false,
          accessReason: error && error.code ? error.code : "session_required",
          available: 0, trialAvailable: 0, paidAvailable: 0, plan: ""
        };
        if (ui.studioAccess) ui.studioAccess.dataset.state = "locked";
        if (ui.entitlementBadge) ui.entitlementBadge.textContent = "CONNEXION REQUISE";
        if (ui.entitlementTitle) ui.entitlementTitle.textContent = "Connectez-vous pour utiliser Studio AI";
        if (ui.entitlementText) ui.entitlementText.textContent = error && error.message ? error.message : "Votre session PRINTELLY est nécessaire.";
        setApiState("Accès non vérifié", "error");
        updateAnalyzeButton();
        if (!silent) setMessage(error && error.message ? error.message : "Impossible de vérifier votre accès Studio AI.", "error");
        return false;
      } finally {
        remover.entitlementPromise = null;
      }
    })();
    return remover.entitlementPromise;
  }

  async function testApi() {
    return refreshEntitlement(false);
  }

  function closePackDialog() {
    if (ui.packDialog && ui.packDialog.open) ui.packDialog.close();
  }

  function appendPackCard(plan) {
    var card = document.createElement("article");
    card.className = "br-pack-card";
    var title = document.createElement("strong");
    title.textContent = String(plan.name || "Pack Studio AI");
    var meta = document.createElement("span");
    meta.textContent = Number(plan.included_credits || plan.background_removals || 0) + " crédits • " + Number(plan.validity_days || 0) + " jours";
    var price = document.createElement("b");
    price.textContent = Number(plan.price_dzd || 0).toLocaleString("fr-DZ") + " DZD";
    var link = document.createElement("a");
    link.className = "primary";
    link.href = "../studio-packs/?plan=" + encodeURIComponent(String(plan.id || ""));
    link.textContent = "CHOISIR CE PACK";
    card.appendChild(title); card.appendChild(meta); card.appendChild(price); card.appendChild(link);
    ui.packList.appendChild(card);
  }

  async function openPackDialog() {
    if (!ui.packDialog) {
      window.location.href = "../studio-packs/";
      return;
    }
    if (ui.packDialogTitle) ui.packDialogTitle.textContent = remover.entitlement.accessReason === "session_required" ? "Connexion nécessaire" : "Votre essai gratuit est terminé";
    if (ui.packDialogText) ui.packDialogText.textContent = remover.entitlement.accessReason === "session_required"
      ? "Connectez-vous pour recevoir votre essai gratuit unique ou utiliser votre pack actif."
      : "Choisissez un pack actif. Dès que l’administrateur valide votre paiement, ce Studio se déverrouille automatiquement.";
    if (!ui.packDialog.open) ui.packDialog.showModal();
    if (!ui.packList) return;
    ui.packList.innerHTML = "<p>Chargement des packs actifs…</p>";
    try {
      if (!window.PrintellyStudioBilling) throw new Error("Catalogue indisponible.");
      var catalog = await window.PrintellyStudioBilling.catalog();
      ui.packList.innerHTML = "";
      var plans = Array.isArray(catalog.plans) ? catalog.plans : [];
      if (!plans.length) {
        ui.packList.innerHTML = "<p>Aucun pack n’est actuellement proposé. Contactez l’assistance PRINTELLY.</p>";
        return;
      }
      plans.slice(0, 3).forEach(appendPackCard);
    } catch (error) {
      ui.packList.innerHTML = "";
      var link = document.createElement("a");
      link.className = "primary";
      link.href = remover.entitlement.accessReason === "session_required" ? "../account/" : "../studio-packs/";
      link.textContent = remover.entitlement.accessReason === "session_required" ? "SE CONNECTER" : "OUVRIR LES PACKS";
      ui.packList.appendChild(link);
    }
  }

  function clearUrls() {
    if (remover.sourceUrl) URL.revokeObjectURL(remover.sourceUrl);
    if (remover.resultUrl) URL.revokeObjectURL(remover.resultUrl);
    remover.sourceUrl = "";
    remover.resultUrl = "";
  }

  function loadImageFromBlob(blob) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(blob);
      var image = new Image();
      image.onload = function () { resolve({ image: image, url: url }); };
      image.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error("L’image ne peut pas être décodée par ce navigateur."));
      };
      image.src = url;
    });
  }

  function safeOutputName(name) {
    var base = (name || "image").replace(/\.[^.]+$/, "");
    base = base.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^[._-]+|[._-]+$/g, "").slice(0, 80) || "image";
    return base + "-sans-fond.png";
  }



  function selectedExportDpi() {
    if (!ui.exportDpi) return 300;
    var raw = ui.exportDpi.value === "custom" && ui.customDpi ? ui.customDpi.value : ui.exportDpi.value;
    return Math.max(36, Math.min(1200, Number(raw) || 300));
  }

  function currentPrintSettings() {
    if (!remover.sourceImage || !window.PrintellyPrintExport || !ui.printWidth) return null;
    return window.PrintellyPrintExport.calculate({
      sourceWidth: remover.sourceImage.naturalWidth,
      sourceHeight: remover.sourceImage.naturalHeight,
      width: Number(ui.printWidth.value),
      height: Number(ui.printHeight && ui.printHeight.value),
      unit: ui.printUnit ? ui.printUnit.value : "cm",
      dpi: selectedExportDpi(),
      mode: ui.dpiMode ? ui.dpiMode.value : "metadata",
      lockRatio: !ui.lockPrintRatio || ui.lockPrintRatio.checked
    });
  }

  function formatPrintNumber(value) {
    return Number(value).toFixed(2).replace(/0+$/, "").replace(/[.,]$/, "").replace(".", ",");
  }

  function updatePrintPanel(refreshQuality) {
    if (!ui.printSummary) return null;
    var custom = ui.exportDpi && ui.exportDpi.value === "custom";
    if (ui.customDpiField) ui.customDpiField.classList.toggle("hidden", !custom);
    if (ui.printHeight) ui.printHeight.readOnly = !ui.lockPrintRatio || ui.lockPrintRatio.checked;

    var settings = currentPrintSettings();
    if (!settings) {
      ui.printSummary.dataset.state = "waiting";
      if (ui.printQuality) ui.printQuality.textContent = "Ajoutez une image";
      if (ui.printPixels) ui.printPixels.textContent = "—";
      if (ui.effectiveDpi) ui.effectiveDpi.textContent = "—";
      if (ui.printBadge) ui.printBadge.textContent = selectedExportDpi() + " DPI";
      return null;
    }

    if (ui.lockPrintRatio && ui.lockPrintRatio.checked && ui.printHeight) {
      ui.printHeight.value = String(Math.round(settings.height * 100) / 100);
    }
    if (ui.printBadge) ui.printBadge.textContent = settings.dpi + " DPI";
    var modeText = settings.mode === "resample" ? "redimensionnement haute qualité" : "pixels originaux + métadonnée";
    if (ui.printQuality) ui.printQuality.textContent = settings.qualityLabel + " — " +
      formatPrintNumber(settings.width) + " × " + formatPrintNumber(settings.height) + " " + settings.unit;
    if (ui.printPixels) ui.printPixels.textContent = "Sortie : " + settings.outputWidth + " × " + settings.outputHeight + " px • " + modeText;
    if (ui.effectiveDpi) ui.effectiveDpi.textContent = "DPI réel de la source : " + Math.round(settings.effectiveDpi) + " • " + settings.message;
    ui.printSummary.dataset.state = settings.quality;
    if (refreshQuality && remover.currentMask) runQualityInspection(true);
    return settings;
  }

  function convertPrintUnit(previous, nextUnit) {
    if (previous === nextUnit || !ui.printWidth || !ui.printHeight) return;
    var factor = previous === "cm" && nextUnit === "in" ? 1 / 2.54 : 2.54;
    ui.printWidth.value = String(Math.round((Number(ui.printWidth.value) || 0) * factor * 100) / 100);
    ui.printHeight.value = String(Math.round((Number(ui.printHeight.value) || 0) * factor * 100) / 100);
  }

  function normalizedImageFile(file) {
    if (!file) return null;
    var declared = String(file.type || "").split(";", 1)[0].trim().toLowerCase();
    var aliases = {
      "image/x-png": "image/png",
      "image/jpg": "image/jpeg",
      "image/pjpeg": "image/jpeg"
    };
    var canonical = aliases[declared] || declared;
    var extension = (file.name.match(/\.([^.]+)$/) || ["", ""])[1].toLowerCase();
    if ((!canonical || canonical === "application/octet-stream") && extension) {
      canonical = extension === "png"
        ? "image/png"
        : ((extension === "jpg" || extension === "jpeg") ? "image/jpeg" : (extension === "webp" ? "image/webp" : ""));
    }
    if (!["image/png", "image/jpeg", "image/webp"].includes(canonical)) return null;
    if (file.type === canonical) return file;
    return new File([file], file.name, {
      type: canonical,
      lastModified: file.lastModified || Date.now()
    });
  }

  async function selectFile(file) {
    if (!file) return;
    var normalized = normalizedImageFile(file);
    if (!normalized) {
      setMessage("Format refusé. Choisissez un PNG, JPEG ou WebP.", "error");
      return;
    }
    file = normalized;
    if (file.size > 50 * 1024 * 1024) {
      setMessage("Le fichier dépasse la limite de 50 Mo.", "error");
      return;
    }
    clearResult(false);
    if (remover.sourceUrl) URL.revokeObjectURL(remover.sourceUrl);
    try {
      var loaded = await loadImageFromBlob(file);
      if (loaded.image.naturalWidth * loaded.image.naturalHeight > 40000000) {
        URL.revokeObjectURL(loaded.url);
        setMessage("Cette image dépasse la limite de sécurité de 40 mégapixels.", "error");
        return;
      }
      remover.file = file;
      remover.sourceImage = loaded.image;
      remover.sourceUrl = loaded.url;
      remover.outputName = safeOutputName(file.name);
      prepareOriginalPreview();
      updatePrintPanel(false);
      ui.empty.classList.add("hidden");
      updateAnalyzeButton();
      ui.reset.disabled = false;
      ui.imageMeta.textContent = file.name + " • " + loaded.image.naturalWidth + " × " + loaded.image.naturalHeight + " px • " + formatBytes(file.size);
      ui.resultInfo.textContent = "Original chargé • lancez l’analyse du sujet";
      setMessage("Image prête. Choisissez le type de sujet puis lancez l’analyse.", "success");
      renderPreview();
    } catch (error) {
      setMessage(error.message, "error");
    }
  }

  function prepareOriginalPreview() {
    var width = remover.sourceImage.naturalWidth;
    var height = remover.sourceImage.naturalHeight;
    var scale = Math.min(1, 1400 / width, 1000 / height);
    remover.previewWidth = Math.max(1, Math.round(width * scale));
    remover.previewHeight = Math.max(1, Math.round(height * scale));
    remover.originalPreview.width = remover.previewWidth;
    remover.originalPreview.height = remover.previewHeight;
    var context = remover.originalPreview.getContext("2d", { willReadFrequently: true });
    context.clearRect(0, 0, remover.previewWidth, remover.previewHeight);
    context.drawImage(remover.sourceImage, 0, 0, remover.previewWidth, remover.previewHeight);
    remover.originalPixels = context.getImageData(0, 0, remover.previewWidth, remover.previewHeight);
    remover.sourceAlpha = new Float32Array(remover.previewWidth * remover.previewHeight);
    for (var alphaIndex = 0, alphaPixel = 3; alphaIndex < remover.sourceAlpha.length; alphaIndex += 1, alphaPixel += 4) {
      remover.sourceAlpha[alphaIndex] = remover.originalPixels.data[alphaPixel] / 255;
    }
    ui.canvas.width = remover.previewWidth;
    ui.canvas.height = remover.previewHeight;
    fitPreview();
  }

  function formatBytes(bytes) {
    if (bytes < 1024 * 1024) return Math.max(1, Math.round(bytes / 1024)) + " Ko";
    return (bytes / (1024 * 1024)).toFixed(1).replace(".", ",") + " Mo";
  }


  function clearQuality(render) {
    remover.qualityReport = null;
    remover.qualityIssueIndex = -1;
    if (ui.qualityScore) {
      ui.qualityScore.dataset.state = "waiting";
      ui.qualityScore.querySelector("strong").textContent = "—";
    }
    if (ui.qualitySummary) ui.qualitySummary.innerHTML = "<p>Lancez l’analyse du sujet pour obtenir le contrôle DTF.</p>";
    if (ui.qualityIssues) ui.qualityIssues.innerHTML = "";
    if (ui.qualityCertificate) {
      ui.qualityCertificate.textContent = "";
      ui.qualityCertificate.classList.add("hidden");
    }
    if (ui.runQuality) ui.runQuality.disabled = true;
    if (ui.nextIssue) ui.nextIssue.disabled = true;
    if (ui.cleanMicro) ui.cleanMicro.disabled = true;
    if (render !== false && remover.sourceImage) renderPreview();
  }

  function effectiveQualityMask() {
    if (!remover.currentMask) return null;
    var mask = new Float32Array(remover.currentMask);
    if (remover.paletteAssignments) {
      for (var index = 0; index < mask.length; index += 1) {
        var paletteIndex = remover.paletteAssignments[index];
        if (paletteIndex >= 0 && remover.paletteHidden[paletteIndex]) mask[index] = 0;
      }
    }
    return mask;
  }

  function runQualityInspection(silent) {
    if (!remover.currentMask || !remover.originalPixels) {
      if (!silent) setMessage("Lancez d’abord l’analyse du sujet.", "warning");
      return null;
    }
    if (!window.PrintellyQualityInspector) {
      if (!silent) setMessage("Le moteur de contrôle qualité n’est pas chargé.", "error");
      return null;
    }
    remover.qualityReport = window.PrintellyQualityInspector.inspect(
      remover.originalPixels,
      effectiveQualityMask(),
      remover.previewWidth,
      remover.previewHeight,
      {
        printWidthCm: (currentPrintSettings() ? currentPrintSettings().widthInches * 2.54 : Number(ui.printWidth.value)),
        sourceWidth: remover.sourceImage.naturalWidth,
        microPixelLimit: Number(ui.microLimit.value)
      }
    );
    remover.qualityIssueIndex = -1;
    renderQualityReport();
    if (!silent) setMessage("Contrôle DTF terminé : " + remover.qualityReport.score + " / 100.", remover.qualityReport.score >= 75 ? "success" : "warning");
    return remover.qualityReport;
  }

  function qualityReportText(report) {
    var lines = [
      "PRINTELLY — RAPPORT DE CONTRÔLE DTF",
      "Verdict : " + (report.verdict || "Vérification recommandée"),
      "Score : " + report.score + " / 100",
      "DPI effectif : " + (report.dpi ? Math.round(report.dpi) : "non défini"),
      "Transparence réelle : " + (report.transparentRatio * 100).toFixed(2) + " %",
      "Semi-transparence : " + (report.semiTransparentRatio * 100).toFixed(2) + " %",
      "Qualité des contours : " + (report.edgeScore == null ? "—" : report.edgeScore + " / 100"),
      "Micro-pixels : " + report.microCount,
      "Marge minimale : " + (report.minimumMargin == null ? "—" : report.minimumMargin + " px"),
      "",
      "POINTS À VÉRIFIER"
    ];
    if (!report.issues.length) lines.push("Aucun défaut critique détecté automatiquement.");
    report.issues.forEach(function (issue, index) {
      lines.push((index + 1) + ". [" + String(issue.severity || "info").toUpperCase() + "] " + issue.title);
      lines.push("   " + issue.message);
      if (issue.measured) lines.push("   Mesuré : " + issue.measured);
      if (issue.recommended) lines.push("   Recommandé : " + issue.recommended);
    });
    lines.push("", "Ce rapport est une aide au contrôle. Il ne modifie pas le design.");
    return lines.join("\n");
  }

  function downloadQualityReport() {
    if (!remover.qualityReport) return;
    var blob = new Blob([qualityReportText(remover.qualityReport)], { type: "text/plain;charset=utf-8" });
    var link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = remover.outputName.replace(/\.png$/i, "") + "-rapport-dtf.txt";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(link.href); }, 1000);
  }

  function renderQualityReport() {
    var report = remover.qualityReport;
    if (!report) return;
    ui.qualityScore.dataset.state = report.status;
    ui.qualityScore.querySelector("strong").textContent = report.score;
    var dpiText = report.dpi ? Math.round(report.dpi) + " DPI" : "taille d’impression non définie";
    if (ui.qualityVerdict) {
      ui.qualityVerdict.dataset.state = report.status;
      ui.qualityVerdict.querySelector("strong").textContent = report.verdict || (report.score >= 90 ? "Prêt pour impression" : "Vérification recommandée");
      ui.qualityVerdict.querySelector("small").textContent = report.issues.length
        ? report.issues.filter(function (issue) { return issue.severity === "error"; }).length + " erreur(s) • " + report.issues.filter(function (issue) { return issue.severity !== "error"; }).length + " avertissement(s)"
        : "Alpha, dimensions, résolution et contours validés automatiquement.";
    }
    if (ui.qualityMetrics) {
      ui.qualityMetrics.innerHTML =
        "<span><b>" + (report.transparentRatio > 0 ? "OUI" : "NON") + "</b><small>Alpha réel</small></span>" +
        "<span><b>" + (report.dpi ? Math.round(report.dpi) : "—") + "</b><small>DPI effectif</small></span>" +
        "<span><b>" + (report.edgeScore == null ? "—" : report.edgeScore) + "</b><small>Contour /100</small></span>" +
        "<span><b>" + report.microCount + "</b><small>Résidus</small></span>";
    }
    ui.qualitySummary.innerHTML = "<p><strong>" + (report.issues.length ? report.issues.length + " point(s) à vérifier" : "Aucun défaut critique détecté") + "</strong><br>" +
      dpiText + " • " + (report.transparentRatio * 100).toFixed(1).replace(".", ",") + " % transparent • " +
      (report.semiTransparentRatio * 100).toFixed(1).replace(".", ",") + " % semi-transparent • finesse estimée " +
      (report.estimatedFineDetailMm ? report.estimatedFineDetailMm.toFixed(2).replace(".", ",") + " mm" : "non calculée") + ".</p>";
    ui.qualityIssues.innerHTML = "";
    report.issues.forEach(function (issue, index) {
      var item = document.createElement("div");
      item.className = "br-quality-issue " + issue.severity;
      var indicator = document.createElement("i");
      var content = document.createElement("div");
      var title = document.createElement("strong");
      title.textContent = issue.title;
      var message = document.createElement("span");
      message.textContent = issue.message;
      content.appendChild(title); content.appendChild(message);
      if (issue.measured || issue.recommended) {
        var measure = document.createElement("small");
        measure.textContent = (issue.measured ? "Mesuré : " + issue.measured : "") + (issue.measured && issue.recommended ? " • " : "") + (issue.recommended ? "Cible : " + issue.recommended : "");
        content.appendChild(measure);
      }
      var locate = document.createElement("button");
      locate.type = "button";
      locate.className = "secondary";
      locate.textContent = issue.bbox ? "VOIR" : "INFO";
      locate.disabled = !issue.bbox;
      locate.addEventListener("click", function () { focusQualityIssue(index); });
      item.appendChild(indicator); item.appendChild(content); item.appendChild(locate);
      ui.qualityIssues.appendChild(item);
    });
    if (!report.issues.length) ui.qualityIssues.innerHTML = '<div class="br-quality-issue"><i style="background:#23956b"></i><div><strong>Design prêt</strong><span>Aucun défaut critique n’a été détecté automatiquement.</span></div></div>';
    ui.nextIssue.disabled = !report.issues.some(function (issue) { return issue.bbox; });
    ui.cleanMicro.disabled = !report.microCount;
    ui.runQuality.disabled = false;
    if (ui.downloadQualityReport) ui.downloadQualityReport.disabled = false;
    ui.qualityCertificate.classList.remove("hidden");
    ui.qualityCertificate.textContent = qualityReportText(report);
  }

  function focusQualityIssue(index) {
    var report = remover.qualityReport;
    if (!report || !report.issues[index] || !report.issues[index].bbox) return;
    remover.qualityIssueIndex = index;
    var bbox = report.issues[index].bbox;
    var centerX = bbox.x + bbox.width / 2;
    var centerY = bbox.y + bbox.height / 2;
    remover.zoom = 4;
    var displayWidth = parseFloat(ui.canvas.style.width) || remover.previewWidth;
    var displayHeight = parseFloat(ui.canvas.style.height) || remover.previewHeight;
    remover.panX = (0.5 - centerX) * displayWidth * remover.zoom;
    remover.panY = (0.5 - centerY) * displayHeight * remover.zoom;
    setView("result");
    applyTransform();
    setMessage(report.issues[index].title + " : " + report.issues[index].message, "warning");
  }

  function focusNextQualityIssue() {
    if (!remover.qualityReport) return;
    var located = [];
    remover.qualityReport.issues.forEach(function (issue, index) { if (issue.bbox) located.push(index); });
    if (!located.length) return;
    var currentPosition = located.indexOf(remover.qualityIssueIndex);
    focusQualityIssue(located[(currentPosition + 1) % located.length]);
  }

  function previewMicroCleanup() {
    var report = remover.qualityReport || runQualityInspection(true);
    if (!report || !report.microCount) {
      setMessage("Aucun micro-pixel isolé à nettoyer.", "success");
      return;
    }
    setPendingSelection({ mask: report.microMask, count: report.microCount }, false);
    setMessage(report.microCount + " micro-pixel(s) apparaissent en rose. Confirmez avec Rendre transparent.", "warning");
  }

  function clearResult(render) {
    if (remover.resultUrl) URL.revokeObjectURL(remover.resultUrl);
    remover.resultUrl = "";
    remover.resultBlob = null;
    remover.resultImage = null;
    remover.serverPixels = null;
    remover.baseMask = null;
    remover.currentMask = null;
    remover.actions = [];
    remover.redo = [];
    clearPendingSelection(false);
    clearPalette(false);
    clearQuality(false);
    ui.download.disabled = true;
    ui.add.disabled = true;
    updateHistory();
    resetStages();
    if (render !== false && remover.sourceImage) renderPreview();
  }

  function resetStages() {
    ui.stages.querySelectorAll("li").forEach(function (item) {
      item.classList.remove("active", "done", "error");
    });
  }

  function stage(name, stateName) {
    var items = Array.from(ui.stages.querySelectorAll("li"));
    var index = items.findIndex(function (item) { return item.dataset.stage === name; });
    items.forEach(function (item, itemIndex) {
      item.classList.toggle("done", itemIndex < index || (itemIndex === index && stateName === "done"));
      item.classList.toggle("active", itemIndex === index && stateName === "active");
      item.classList.toggle("error", itemIndex === index && stateName === "error");
    });
  }

  function clearProgressTimers() {
    remover.progressTimers.forEach(clearTimeout);
    remover.progressTimers = [];
  }

  function setProcessing(processing) {
    remover.processing = Boolean(processing);
    updateAnalyzeButton();
    ui.cancel.classList.toggle("hidden", !processing);
    ui.progress.classList.toggle("hidden", !processing);
    document.querySelectorAll("[data-br-mode]").forEach(function (button) { button.disabled = processing; });
  }

  async function errorDetail(response) {
    try {
      var body = await response.json();
      return body.detail || "Le serveur a refusé le traitement.";
    } catch (_) {
      return "Erreur serveur " + response.status + ".";
    }
  }

  async function analyze() {
    if (!remover.file) return;
    await refreshEntitlement(true);
    if (!remover.entitlement.accessAllowed) {
      setMessage("Votre essai gratuit est terminé. Choisissez un pack Studio AI pour continuer.", "warning");
      openPackDialog();
      return;
    }
    if (remover.abortController) {
      setMessage("Un traitement est déjà en cours. Patientez ou utilisez Annuler.", "warning");
      return;
    }
    remover.abortController = new AbortController();
    clearResult(false);
    clearProgressTimers();
    resetStages();
    setProcessing(true);
    setMessage("Analyse de l’image en cours…", "");
    stage("upload", "active");
    var requestTimedOut = false;

    remover.progressTimers.push(setTimeout(function () {
      requestTimedOut = true;
      if (remover.abortController) remover.abortController.abort();
    }, 315000));
    remover.progressTimers.push(setTimeout(function () { stage("segment", "active"); setMessage("PhotoRoom détecte le sujet, les cheveux et les contours…", ""); }, 350));
    remover.progressTimers.push(setTimeout(function () { stage("refine", "active"); setMessage("Récupération du fond, de l’alpha et des micro-détails…", ""); }, 1800));

    try {
      if (!window.PrintellyBackgroundApi) throw new Error("Client API non chargé.");
      var apiResult = await window.PrintellyBackgroundApi.remove(apiBase(), remover.file, {
        mode: remover.mode,
        feather: Number(ui.feather.value),
        edgeShift: Number(ui.edge.value),
        decontaminate: ui.decontaminate.checked,
        backgroundCleanup: ui.backgroundCleanup.value,
        blackBackgroundMode: ui.blackBackgroundMode ? ui.blackBackgroundMode.value : "off",
        removeHaze: ui.removeHaze.checked,
        protectDetails: ui.protectDetails.checked,
        backgroundColor: ui.useBackgroundColor.checked ? ui.backgroundColor.value : ""
      }, remover.abortController.signal);

      stage("verify", "active");
      var blob = apiResult.blob;
      var loaded = await loadImageFromBlob(blob);
      if (loaded.image.naturalWidth !== remover.sourceImage.naturalWidth || loaded.image.naturalHeight !== remover.sourceImage.naturalHeight) {
        URL.revokeObjectURL(loaded.url);
        throw new Error("Le service a modifié les dimensions de l’image.");
      }
      remover.resultBlob = blob;
      remover.resultImage = loaded.image;
      remover.resultUrl = loaded.url;
      buildBaseMask();
      stage("verify", "done");

      var processingMs = apiResult.metadata.processingMs;
      var ratio = apiResult.metadata.foregroundRatio;
      var model = apiResult.metadata.modelName;
      var residualHaze = Number(apiResult.metadata.residualHazeRatio || 0);
      var sourceAlphaPreserved = apiResult.metadata.sourceAlphaPreserved === true;
      var effectiveMode = apiResult.metadata.effectiveMode || remover.mode;
      var blackBackgroundMode = apiResult.metadata.blackBackgroundMode || "off";
      var blackBackgroundConfidence = Number(apiResult.metadata.blackBackgroundConfidence || 0);
      var warnings = Array.isArray(apiResult.metadata.warnings)
        ? apiResult.metadata.warnings
        : [];
      updateQuality(
        model,
        processingMs,
        ratio,
        residualHaze,
        warnings,
        effectiveMode,
        blackBackgroundMode,
        blackBackgroundConfidence
      );
      ui.resultInfo.textContent = (sourceAlphaPreserved ? "Alpha original protégé • " : "PNG RGBA • ") + remover.sourceImage.naturalWidth + " × " + remover.sourceImage.naturalHeight + " px";
      ui.download.disabled = false;
      ui.add.disabled = false;
      setMessage(
        sourceAlphaPreserved
          ? "Cette image était déjà transparente : son canal alpha original a été conservé sans redécoupe."
          : (warnings.length ? "Résultat créé avec " + warnings.length + " zone à vérifier." : "Fond supprimé. Vérifiez les contours avant l’export."),
        sourceAlphaPreserved ? "success" : (warnings.length ? "warning" : "success")
      );
      renderPreview();
    } catch (error) {
      if (error.name === "AbortError") {
        setMessage(
          requestTimedOut
            ? "PhotoRoom n’a pas terminé dans le délai prévu. L’image originale reste disponible; réessayez dans quelques instants."
            : "Traitement annulé. L’image originale est toujours disponible.",
          "warning"
        );
        resetStages();
      } else {
        var active = ui.stages.querySelector("li.active");
        if (active) {
          active.classList.remove("active");
          active.classList.add("error");
        }
        setMessage(error.message || "Le traitement a échoué.", "error");
        if (error && (error.status === 402 || ["trial_exhausted","credit_required","active_pack_required","pack_required"].includes(error.code))) {
          remover.entitlement.checked = true;
          remover.entitlement.accessAllowed = false;
          remover.entitlement.accessReason = error.code || "trial_exhausted";
          openPackDialog();
        }
      }
    } finally {
      clearProgressTimers();
      setProcessing(false);
      remover.abortController = null;
      refreshEntitlement(true);
    }
  }

  function updateQuality(
    model,
    milliseconds,
    ratio,
    residualHaze,
    warnings,
    effectiveMode,
    blackBackgroundMode,
    blackBackgroundConfidence
  ) {
    var percent = Math.round(ratio * 100);
    var hazePercent = Math.min(100, Math.max(0, residualHaze * 100));
    var profile = String(effectiveMode || "auto").toUpperCase();
    ui.backgroundInfo.querySelector("strong").textContent = "Sujet détecté • " + percent + " % de l’image";
    var blackProfile = blackBackgroundMode && blackBackgroundMode !== "off"
      ? " • fond noir " + String(blackBackgroundMode).toUpperCase()
        + " " + Math.round(blackBackgroundConfidence * 100) + " %"
      : "";
    ui.backgroundInfo.querySelector("span").textContent = "Moteur " + model + " • profil " + profile + blackProfile + (milliseconds ? " • " + (milliseconds / 1000).toFixed(1).replace(".", ",") + " s" : "") + " • résidu " + hazePercent.toFixed(1).replace(".", ",") + " %";
    ui.qualityInfo.classList.toggle("warning", warnings.length > 0);
    ui.qualityInfo.querySelector("strong").textContent = warnings.length ? "Vérification recommandée" : "Fond réellement transparent";
    ui.qualityInfo.querySelector("span").textContent = warnings.length ? warnings.join(" ") : "Le canal alpha est valide et aucun voile de fond important n’a été détecté.";
  }

  function buildBaseMask() {
    var canvas = document.createElement("canvas");
    canvas.width = remover.previewWidth;
    canvas.height = remover.previewHeight;
    var context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(remover.resultImage, 0, 0, canvas.width, canvas.height);
    remover.serverPixels = context.getImageData(0, 0, canvas.width, canvas.height);
    var data = remover.serverPixels.data;
    remover.baseMask = new Float32Array(canvas.width * canvas.height);
    for (var index = 0, pixel = 0; index < remover.baseMask.length; index += 1, pixel += 4) {
      remover.baseMask[index] = data[pixel + 3] / 255;
    }
    rebuildMask();
    analyzeColors(true);
    ui.runQuality.disabled = false;
    runQualityInspection(true);
  }

  function rebuildMask() {
    if (!remover.baseMask) return;
    remover.currentMask = new Float32Array(remover.baseMask);
    remover.actions.forEach(function (action) { applyMaskAction(remover.currentMask, action); });
    updateHistory();
    renderPreview();
  }

  function applyMaskAction(mask, action) {
    if (action.tool === "selection-erase") {
      if (window.PrintellyColorSelection) window.PrintellyColorSelection.eraseMask(mask, action.selection);
      return;
    }
    applyStroke(mask, action);
  }

  function applyStroke(mask, stroke, fromIndex) {
    var points = stroke.points;
    var start = Math.max(0, fromIndex || 0);
    for (var index = start; index < points.length; index += 1) {
      if (index > 0) applySegment(mask, stroke, points[index - 1], points[index]);
      else applyBrushPoint(mask, stroke, points[index]);
    }
  }

  function applySegment(mask, stroke, a, b) {
    var dx = (b.x - a.x) * remover.previewWidth;
    var dy = (b.y - a.y) * remover.previewHeight;
    var distance = Math.sqrt(dx * dx + dy * dy);
    var radius = Math.max(1, stroke.size * Math.max(remover.previewWidth, remover.previewHeight) / 2);
    var steps = Math.max(1, Math.ceil(distance / Math.max(1, radius * 0.35)));
    for (var step = 1; step <= steps; step += 1) {
      var t = step / steps;
      applyBrushPoint(mask, stroke, { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }

  function applyBrushPoint(mask, stroke, point) {
    var cx = point.x * remover.previewWidth;
    var cy = point.y * remover.previewHeight;
    var radius = Math.max(1, stroke.size * Math.max(remover.previewWidth, remover.previewHeight) / 2);
    var hardRadius = radius * stroke.hardness;
    var minX = Math.max(0, Math.floor(cx - radius));
    var maxX = Math.min(remover.previewWidth - 1, Math.ceil(cx + radius));
    var minY = Math.max(0, Math.floor(cy - radius));
    var maxY = Math.min(remover.previewHeight - 1, Math.ceil(cy + radius));
    for (var y = minY; y <= maxY; y += 1) {
      for (var x = minX; x <= maxX; x += 1) {
        var dx = x - cx;
        var dy = y - cy;
        var distance = Math.sqrt(dx * dx + dy * dy);
        if (distance > radius) continue;
        var falloff = distance <= hardRadius ? 1 : 1 - (distance - hardRadius) / Math.max(0.001, radius - hardRadius);
        var weight = Math.max(0, Math.min(1, falloff * stroke.opacity));
        var offset = y * remover.previewWidth + x;
        var sourceMaximum = remover.sourceAlpha ? remover.sourceAlpha[offset] : 1;
        mask[offset] = stroke.tool === "protect"
          ? mask[offset] + (sourceMaximum - mask[offset]) * weight
          : mask[offset] * (1 - weight);
      }
    }
  }

  function resultPixels() {
    var basis = remover.serverPixels || remover.originalPixels;
    var output = new ImageData(new Uint8ClampedArray(basis.data), remover.previewWidth, remover.previewHeight);
    if (!remover.currentMask) return output;
    for (var index = 0, pixel = 0; index < remover.currentMask.length; index += 1, pixel += 4) {
      if (remover.baseMask && remover.currentMask[index] > remover.baseMask[index] + 0.002) {
        output.data[pixel] = remover.originalPixels.data[pixel];
        output.data[pixel + 1] = remover.originalPixels.data[pixel + 1];
        output.data[pixel + 2] = remover.originalPixels.data[pixel + 2];
      }
      var alpha = remover.currentMask[index];
      var paletteIndex = remover.paletteAssignments ? remover.paletteAssignments[index] : -1;
      if (paletteIndex >= 0 && remover.paletteHidden[paletteIndex]) alpha = 0;
      output.data[pixel + 3] = Math.round(alpha * 255);
    }
    return output;
  }

  function renderPreview() {
    if (!remover.sourceImage || !remover.originalPixels) return;
    var context = ui.canvas.getContext("2d");
    context.clearRect(0, 0, ui.canvas.width, ui.canvas.height);
    if (!remover.currentMask || remover.view === "original") {
      context.drawImage(remover.originalPreview, 0, 0);
    } else if (remover.view === "mask") {
      var maskImage = context.createImageData(remover.previewWidth, remover.previewHeight);
      for (var i = 0, p = 0; i < remover.currentMask.length; i += 1, p += 4) {
        var value = Math.round(remover.currentMask[i] * 255);
        maskImage.data[p] = value; maskImage.data[p + 1] = value; maskImage.data[p + 2] = value; maskImage.data[p + 3] = 255;
      }
      context.putImageData(maskImage, 0, 0);
    } else {
      context.putImageData(resultPixels(), 0, 0);
      if (remover.view === "split") {
        var splitX = Math.round(remover.previewWidth * Number(ui.split.value) / 100);
        context.save();
        context.beginPath();
        context.rect(0, 0, splitX, remover.previewHeight);
        context.clip();
        context.drawImage(remover.originalPreview, 0, 0);
        context.restore();
        context.fillStyle = "#f97316";
        context.fillRect(Math.max(0, splitX - 1), 0, 2, remover.previewHeight);
      } else if (remover.view === "edges") {
        drawEdgeOverlay(context);
      } else if (remover.view === "ambiguous") {
        drawAmbiguousOverlay(context);
      }
    }
    if (remover.pendingSelection) drawSelectionOverlay(context);
    if (remover.manualGuide) drawManualGuideOverlay(context);
    applyTransform();
  }

  function drawSelectionOverlay(context) {
    var overlay = context.createImageData(remover.previewWidth, remover.previewHeight);
    for (var index = 0, pixel = 0; index < remover.pendingSelection.length; index += 1, pixel += 4) {
      if (!remover.pendingSelection[index]) continue;
      overlay.data[pixel] = 236;
      overlay.data[pixel + 1] = 38;
      overlay.data[pixel + 2] = 145;
      overlay.data[pixel + 3] = 125;
    }
    blendOverlay(context, overlay);
  }

  function drawManualGuideOverlay(context) {
    var overlay = context.createImageData(remover.previewWidth, remover.previewHeight);
    for (var index = 0, pixel = 0; index < remover.manualGuide.length; index += 1, pixel += 4) {
      if (!remover.manualGuide[index]) continue;
      overlay.data[pixel] = 37;
      overlay.data[pixel + 1] = 99;
      overlay.data[pixel + 2] = 235;
      overlay.data[pixel + 3] = 105;
    }
    blendOverlay(context, overlay);
  }

  function blendOverlay(context, imageData) {
    var overlayCanvas = document.createElement("canvas");
    overlayCanvas.width = remover.previewWidth;
    overlayCanvas.height = remover.previewHeight;
    overlayCanvas.getContext("2d").putImageData(imageData, 0, 0);
    context.drawImage(overlayCanvas, 0, 0);
    overlayCanvas.width = overlayCanvas.height = 1;
  }

  function drawEdgeOverlay(context) {
    var overlay = context.createImageData(remover.previewWidth, remover.previewHeight);
    var width = remover.previewWidth;
    for (var y = 1; y < remover.previewHeight - 1; y += 1) {
      for (var x = 1; x < width - 1; x += 1) {
        var index = y * width + x;
        var delta = Math.max(
          Math.abs(remover.currentMask[index] - remover.currentMask[index - 1]),
          Math.abs(remover.currentMask[index] - remover.currentMask[index + 1]),
          Math.abs(remover.currentMask[index] - remover.currentMask[index - width]),
          Math.abs(remover.currentMask[index] - remover.currentMask[index + width])
        );
        if (delta > 0.06) {
          var pixel = index * 4;
          overlay.data[pixel] = 255; overlay.data[pixel + 1] = 195; overlay.data[pixel + 2] = 0; overlay.data[pixel + 3] = 230;
        }
      }
    }
    blendOverlay(context, overlay);
  }

  function drawAmbiguousOverlay(context) {
    var overlay = context.createImageData(remover.previewWidth, remover.previewHeight);
    for (var index = 0, pixel = 0; index < remover.currentMask.length; index += 1, pixel += 4) {
      var alpha = remover.currentMask[index];
      if (alpha >= 0.05 && alpha <= 0.95) {
        overlay.data[pixel] = 239; overlay.data[pixel + 1] = 68; overlay.data[pixel + 2] = 180;
        overlay.data[pixel + 3] = Math.round(75 + 100 * (1 - Math.abs(alpha - 0.5) * 2));
      }
    }
    blendOverlay(context, overlay);
  }

  function sizeCanvasToShell() {
    if (!remover.previewWidth || !remover.previewHeight) return;
    var availableWidth = Math.max(120, ui.shell.clientWidth - 24);
    var availableHeight = Math.max(120, ui.shell.clientHeight - 24);
    var scale = Math.min(1, availableWidth / remover.previewWidth, availableHeight / remover.previewHeight);
    ui.canvas.style.width = Math.max(1, Math.round(remover.previewWidth * scale)) + "px";
    ui.canvas.style.height = Math.max(1, Math.round(remover.previewHeight * scale)) + "px";
  }

  function applyTransform() {
    ui.canvas.style.transform = "translate(" + remover.panX + "px," + remover.panY + "px) scale(" + remover.zoom + ")";
    ui.zoomValue.textContent = Math.round(remover.zoom * 100) + " %";
  }

  function fitPreview() {
    remover.zoom = 1;
    remover.panX = 0;
    remover.panY = 0;
    sizeCanvasToShell();
    applyTransform();
  }

  function changeZoom(factor) {
    remover.zoom = Math.max(1, Math.min(8, remover.zoom * factor));
    if (remover.zoom === 1) { remover.panX = 0; remover.panY = 0; }
    applyTransform();
  }

  function normalizedPoint(event) {
    var rect = ui.canvas.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height))
    };
  }

  function hexColor(value) {
    var text = String(value || "#ffffff").replace("#", "");
    return {
      red: parseInt(text.slice(0, 2), 16) || 0,
      green: parseInt(text.slice(2, 4), 16) || 0,
      blue: parseInt(text.slice(4, 6), 16) || 0
    };
  }

  function colorHex(color) {
    return "#" + [color.red, color.green, color.blue].map(function (value) {
      return Math.max(0, Math.min(255, value)).toString(16).padStart(2, "0");
    }).join("");
  }

  function clearPendingSelection(render) {
    remover.pendingSelection = null;
    remover.pendingSelectionCount = 0;
    remover.manualGuide = null;
    if (ui.applyRemoval) ui.applyRemoval.disabled = true;
    if (ui.cancelRemoval) ui.cancelRemoval.disabled = true;
    if (ui.removalSelectionCount) ui.removalSelectionCount.textContent = "0 px";
    if (render !== false && remover.sourceImage) renderPreview();
  }

  function setPendingSelection(result, merge, emptyMessage) {
    if (!result || !result.mask || !result.count) {
      remover.manualGuide = null;
      if (!merge || !remover.pendingSelection) clearPendingSelection(false);
      setMessage(emptyMessage || "Aucune zone de fond ne correspond à ce réglage.", "warning");
      renderPreview();
      return;
    }
    if (merge && remover.pendingSelection && remover.pendingSelection.length === result.mask.length) {
      var mergedCount = 0;
      for (var index = 0; index < result.mask.length; index += 1) {
        if (result.mask[index]) remover.pendingSelection[index] = 1;
        if (remover.pendingSelection[index]) mergedCount += 1;
      }
      remover.pendingSelectionCount = mergedCount;
    } else {
      remover.pendingSelection = new Uint8Array(result.mask);
      remover.pendingSelectionCount = result.count;
    }
    ui.applyRemoval.disabled = false;
    ui.cancelRemoval.disabled = false;
    if (ui.removalSelectionCount) ui.removalSelectionCount.textContent = remover.pendingSelectionCount.toLocaleString("fr-FR") + " px";
    var percent = remover.pendingSelectionCount * 100 / Math.max(1, remover.previewWidth * remover.previewHeight);
    var message = percent >= 75
      ? "Sélection très importante : " + percent.toFixed(1).replace(".", ",") + " % de l’image. Vérifiez attentivement avant de confirmer."
      : "Prévisualisation : " + percent.toFixed(1).replace(".", ",") + " % de l’image sera rendue transparente.";
    setMessage(message, "warning");
    renderPreview();
  }

  function selectionForMethod(method, point) {
    if (!window.PrintellyColorSelection) throw new Error("Moteur de sélection couleur non chargé.");
    if (!remover.originalPixels) throw new Error("Chargez d’abord une image.");
    var engine = window.PrintellyColorSelection;
    var tolerance = Number(ui.colorTolerance.value);
    var color = point
      ? engine.colorAt(remover.originalPixels, remover.previewWidth, remover.previewHeight, point.x * (remover.previewWidth - 1), point.y * (remover.previewHeight - 1))
      : hexColor(ui.targetColor.value);
    ui.targetColor.value = colorHex(color);
    if (method === "global") return engine.matchingColor(remover.originalPixels, remover.previewWidth, remover.previewHeight, color, tolerance);
    if (method === "exterior") return engine.exteriorColor(remover.originalPixels, remover.previewWidth, remover.previewHeight, color, tolerance);
    if (method === "manual" && point) {
      return engine.connectedRegion(remover.originalPixels, remover.previewWidth, remover.previewHeight, color.x, color.y, tolerance);
    }
    throw new Error("Cliquez sur la zone de fond oubliée.");
  }

  function previewRemoval(point) {
    if (!remover.currentMask) {
      setMessage("Lancez d’abord l’analyse du sujet.", "warning");
      return;
    }
    var method = ui.removalMethod.value;
    if (method === "auto") {
      analyze();
      return;
    }
    try {
      var result = selectionForMethod(method, point);
      var emptyMessage = method === "exterior"
        ? "Aucune zone de cette couleur n’est connectée aux bords. Utilisez la sélection manuelle ou Toute une couleur."
        : "Aucune zone de fond ne correspond à cette couleur et cette tolérance.";
      setPendingSelection(result, method === "manual" || remover.multiPointMode, emptyMessage);
    } catch (error) {
      setMessage(error.message, "warning");
    }
  }


  function clearPalette(render) {
    remover.paletteColors = [];
    remover.paletteAssignments = null;
    remover.paletteHidden = {};
    remover.paletteProtected = {};
    remover.paletteSelectedIndex = -1;
    if (ui.paletteCount) ui.paletteCount.textContent = "Non analysées";
    if (ui.paletteList) ui.paletteList.innerHTML = "<p>Analysez d’abord le sujet, puis détectez les couleurs du design.</p>";
    if (ui.paletteMetrics) ui.paletteMetrics.innerHTML = "<span><b>—</b><small>Couleurs</small></span><span><b>—</b><small>Dominante</small></span><span><b>—</b><small>Contraste</small></span>";
    if (ui.paletteWarnings) ui.paletteWarnings.textContent = "Analysez le résultat pour détecter les tons à protéger.";
    if (ui.showAllColors) ui.showAllColors.disabled = true;
    if (ui.previewColorRemoval) ui.previewColorRemoval.disabled = true;
    if (ui.deleteSelectedColor) ui.deleteSelectedColor.disabled = true;
    if (render !== false && remover.sourceImage) renderPreview();
  }

  function paletteMask(paletteIndex) {
    if (!remover.paletteAssignments || paletteIndex < 0) return { mask: null, count: 0 };
    var mask = new Uint8Array(remover.paletteAssignments.length);
    var count = 0;
    for (var index = 0; index < mask.length; index += 1) {
      if (remover.paletteAssignments[index] === paletteIndex && (!remover.currentMask || remover.currentMask[index] > 0.05)) {
        mask[index] = 1;
        count += 1;
      }
    }
    return { mask: mask, count: count };
  }

  function hasHiddenPaletteColors() {
    return Object.keys(remover.paletteHidden).some(function (key) { return remover.paletteHidden[key]; });
  }

  function paletteLuminance(color) {
    function linear(channel) {
      var value = channel / 255;
      return value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
    }
    return 0.2126 * linear(color.r) + 0.7152 * linear(color.g) + 0.0722 * linear(color.b);
  }

  function paletteFamily(color) {
    var max = Math.max(color.r, color.g, color.b);
    var min = Math.min(color.r, color.g, color.b);
    if (max < 35) return "Noir / très sombre";
    if (min > 225) return "Blanc / très clair";
    if (max - min < 18) return "Gris neutre";
    return "Couleur chromatique";
  }

  function renderPalette() {
    if (!ui.paletteList) return;
    ui.paletteList.innerHTML = "";
    if (!remover.paletteColors.length) {
      ui.paletteList.innerHTML = "<p>Aucune couleur dominante détectée dans le sujet visible.</p>";
      return;
    }
    var luminances = remover.paletteColors.map(paletteLuminance);
    var contrast = (Math.max.apply(Math, luminances) + 0.05) / (Math.min.apply(Math, luminances) + 0.05);
    if (ui.paletteMetrics) {
      ui.paletteMetrics.innerHTML =
        "<span><b>" + remover.paletteColors.length + "</b><small>Couleurs</small></span>" +
        "<span><b>" + colorHex(remover.paletteColors[0]).toUpperCase() + "</b><small>Dominante</small></span>" +
        "<span><b>" + contrast.toFixed(1).replace(".", ",") + ":1</b><small>Contraste</small></span>";
    }
    var lightCount = remover.paletteColors.filter(function (color) { return paletteLuminance(color) > 0.82; }).length;
    var darkCount = remover.paletteColors.filter(function (color) { return paletteLuminance(color) < 0.03; }).length;
    if (ui.paletteWarnings) {
      ui.paletteWarnings.textContent = lightCount && darkCount
        ? "Design à fort contraste : protégez les détails blancs et noirs avant toute suppression globale."
        : lightCount
          ? "Des tons très clairs sont présents dans le sujet : utilisez le fond extérieur connecté."
          : darkCount
            ? "Des tons noirs sont présents : vérifiez sur fond blanc et évitez un seuil de luminosité global."
            : "Palette équilibrée. Contrôlez les couleurs proches du fond avant de les rendre transparentes.";
    }
    remover.paletteColors.forEach(function (color, index) {
      var item = document.createElement("div");
      item.className = "br-palette-item";
      if (index === remover.paletteSelectedIndex) item.classList.add("selected");
      if (remover.paletteHidden[index]) item.classList.add("hidden-color");
      if (remover.paletteProtected[index]) item.classList.add("protected-color");

      var swatch = document.createElement("span");
      swatch.className = "br-palette-swatch";
      swatch.style.backgroundColor = colorHex(color);

      var meta = document.createElement("div");
      meta.className = "br-palette-meta";
      var title = document.createElement("strong");
      title.textContent = colorHex(color).toUpperCase() + " • " + paletteFamily(color);
      var detail = document.createElement("small");
      detail.textContent = "RGB " + color.r + ", " + color.g + ", " + color.b + " • " + (color.ratio * 100).toFixed(1).replace(".", ",") + " % du sujet";
      var protection = document.createElement("small");
      protection.className = "br-palette-protection";
      protection.textContent = remover.paletteProtected[index] ? "PROTÉGÉE — suppression désactivée" : "Non protégée";
      meta.appendChild(title); meta.appendChild(detail); meta.appendChild(protection);

      var buttons = document.createElement("div");
      buttons.className = "br-palette-buttons";
      var eye = document.createElement("button");
      eye.type = "button";
      eye.textContent = remover.paletteHidden[index] ? "○" : "●";
      eye.title = remover.paletteHidden[index] ? "Afficher cette couleur" : "Masquer temporairement cette couleur";
      eye.addEventListener("click", function () {
        remover.paletteHidden[index] = !remover.paletteHidden[index];
        renderPalette(); renderPreview();
      });
      var protect = document.createElement("button");
      protect.type = "button";
      protect.textContent = remover.paletteProtected[index] ? "✓P" : "P";
      protect.title = remover.paletteProtected[index] ? "Retirer la protection" : "Protéger cette couleur contre la suppression";
      protect.addEventListener("click", function () {
        remover.paletteProtected[index] = !remover.paletteProtected[index];
        renderPalette();
        setMessage(remover.paletteProtected[index] ? "Couleur protégée contre la suppression." : "Protection de couleur retirée.", "success");
      });
      var choose = document.createElement("button");
      choose.type = "button";
      choose.textContent = "CIBLE";
      choose.title = "Sélectionner et contrôler cette couleur";
      choose.addEventListener("click", function () { selectPaletteColor(index); });
      buttons.appendChild(eye); buttons.appendChild(protect); buttons.appendChild(choose);

      item.appendChild(swatch); item.appendChild(meta); item.appendChild(buttons);
      ui.paletteList.appendChild(item);
    });
    ui.paletteCount.textContent = remover.paletteColors.length + " couleur" + (remover.paletteColors.length > 1 ? "s" : "");
    ui.showAllColors.disabled = false;
    ui.previewColorRemoval.disabled = remover.paletteSelectedIndex < 0;
    ui.deleteSelectedColor.disabled = remover.paletteSelectedIndex < 0 || Boolean(remover.paletteProtected[remover.paletteSelectedIndex]);
  }

  function analyzeColors(silent) {
    if (!remover.currentMask || !remover.originalPixels) {
      if (!silent) setMessage("Lancez d’abord l’analyse du sujet.", "warning");
      return;
    }
    if (!window.PrintellyColorSelection || !window.PrintellyColorSelection.extractPalette) {
      if (!silent) setMessage("Le moteur d’analyse des couleurs n’est pas chargé.", "error");
      return;
    }
    var result = window.PrintellyColorSelection.extractPalette(
      remover.originalPixels,
      remover.previewWidth,
      remover.previewHeight,
      remover.currentMask,
      8
    );
    remover.paletteColors = result.colors;
    remover.paletteAssignments = result.assignments;
    remover.paletteHidden = {};
    remover.paletteProtected = {};
    remover.paletteSelectedIndex = -1;
    renderPalette();
    if (!silent) {
      ui.paletteMenu.open = true;
      setMessage(remover.paletteColors.length + " couleur(s) dominante(s) détectée(s) dans le sujet.", "success");
    }
    renderPreview();
  }

  function selectPaletteColor(index) {
    if (!remover.paletteColors[index]) return;
    remover.paletteSelectedIndex = index;
    var color = remover.paletteColors[index];
    ui.targetColor.value = colorHex(color);
    var selection = paletteMask(index);
    setPendingSelection(selection, false, "Cette couleur ne contient plus aucun pixel visible.");
    renderPalette();
  }

  function showAllPaletteColors() {
    remover.paletteHidden = {};
    renderPalette();
    renderPreview();
    setMessage("Toutes les couleurs sont de nouveau visibles.", "success");
  }

  function deleteSelectedPaletteColor() {
    var index = remover.paletteSelectedIndex;
    if (index < 0) return;
    if (remover.paletteProtected[index]) {
      setMessage("Cette couleur est protégée. Retirez sa protection avant de la rendre transparente.", "warning");
      return;
    }
    selectPaletteColor(index);
    if (!remover.pendingSelectionCount) return;
    delete remover.paletteHidden[index];
    applyPendingSelection();
    renderPalette();
    setMessage("La couleur sélectionnée est devenue transparente. Utilisez Annuler pour la restaurer.", "success");
  }

  function applyPendingSelection() {
    if (!remover.pendingSelection || !remover.pendingSelectionCount) return;
    remover.actions.push({
      tool: "selection-erase",
      selection: new Uint8Array(remover.pendingSelection),
      width: remover.previewWidth,
      height: remover.previewHeight
    });
    remover.redo = [];
    clearPendingSelection(false);
    rebuildMask();
    runQualityInspection(true);
    setMessage("La zone sélectionnée est maintenant transparente. Vous pouvez annuler cette action.", "success");
  }

  function updateRemovalMethod() {
    var method = ui.removalMethod.value;
    var descriptions = {
      auto: "Relance l’analyse sémantique complète du sujet.",
      global: "Supprime la couleur choisie partout, même dans les zones intérieures séparées.",
      exterior: "Supprime uniquement la couleur connectée aux bords. Les zones intérieures restent protégées.",
      manual: "Dessinez dans le fond oublié. Le moteur étend prudemment la sélection aux pixels reliés et similaires autour du trait."
    };
    ui.removalHint.textContent = descriptions[method];
    ui.removalHint.classList.toggle("warning", method === "global");
    if (ui.removalConnectivity) ui.removalConnectivity.textContent = method === "exterior" ? "BORDS ON" : method === "manual" ? "LOCAL" : method === "global" ? "GLOBAL" : "IA";
    if (ui.removalSafety) ui.removalSafety.textContent = method === "global" ? "RISQUE" : "PROTÉGÉ";
    ui.previewRemoval.textContent = method === "manual" ? "DESSINER LA ZONE" : (method === "auto" ? "RELANCER L’IA" : "PRÉVISUALISER");
    clearPendingSelection(true);
    if (method === "manual") setTool("manual-background");
    else if (method !== "auto") setTool("color-select");
    else setTool("pan");
    if (remover.currentMask && (method === "global" || method === "exterior")) previewRemoval();
  }

  function beginManualGuide(point) {
    if (!window.PrintellyColorSelection) throw new Error("Moteur de sélection couleur non chargé.");
    remover.manualGuide = new Uint8Array(remover.previewWidth * remover.previewHeight);
    remover.drawing = true;
    remover.activeStroke = { tool: "manual-guide", points: [point] };
    paintManualGuidePoint(point);
  }

  function paintManualGuidePoint(point) {
    if (!remover.manualGuide) return;
    var cx = point.x * remover.previewWidth;
    var cy = point.y * remover.previewHeight;
    var radius = Math.max(2, Number(ui.brush.value) * Math.max(remover.previewWidth, remover.previewHeight) / Math.max(remover.sourceImage.naturalWidth, remover.sourceImage.naturalHeight) / 2);
    var minX = Math.max(0, Math.floor(cx - radius));
    var maxX = Math.min(remover.previewWidth - 1, Math.ceil(cx + radius));
    var minY = Math.max(0, Math.floor(cy - radius));
    var maxY = Math.min(remover.previewHeight - 1, Math.ceil(cy + radius));
    for (var y = minY; y <= maxY; y += 1) {
      for (var x = minX; x <= maxX; x += 1) {
        var dx = x - cx;
        var dy = y - cy;
        if (dx * dx + dy * dy <= radius * radius) remover.manualGuide[y * remover.previewWidth + x] = 1;
      }
    }
  }

  function paintManualGuideSegment(a, b) {
    var dx = (b.x - a.x) * remover.previewWidth;
    var dy = (b.y - a.y) * remover.previewHeight;
    var distance = Math.sqrt(dx * dx + dy * dy);
    var steps = Math.max(1, Math.ceil(distance / 2));
    for (var step = 1; step <= steps; step += 1) {
      var t = step / steps;
      paintManualGuidePoint({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }

  function finishManualGuide() {
    if (!remover.manualGuide || !window.PrintellyColorSelection) return;
    try {
      var dominantColor = window.PrintellyColorSelection.dominantGuideColor(
        remover.originalPixels,
        remover.previewWidth,
        remover.previewHeight,
        remover.manualGuide
      );
      var guidedEngine = window.PrintellyColorSelection.guidedRegion || window.PrintellyColorSelection.guidedSelection;
      var result = guidedEngine(
        remover.originalPixels,
        remover.previewWidth,
        remover.previewHeight,
        remover.manualGuide,
        dominantColor,
        Number(ui.colorTolerance.value)
      );
      ui.targetColor.value = colorHex(dominantColor);
      remover.manualGuide = null;
      setPendingSelection(result, true, "Aucun pixel de fond compatible n’a été trouvé dans la zone dessinée.");
      if (result.count) setMessage("Fond relié détecté en rose autour de votre dessin. Vérifiez puis cliquez sur Rendre transparent.", "success");
    } catch (error) {
      remover.manualGuide = null;
      setMessage(error.message, "warning");
      renderPreview();
    }
  }


  function eraseMagicExterior(point) {
    if (!remover.currentMask || !remover.originalPixels) {
      setMessage("Lancez d’abord l’analyse du sujet.", "warning");
      return;
    }
    if (!window.PrintellyColorSelection || !window.PrintellyColorSelection.magicExterior) {
      setMessage("La gomme magique n’est pas chargée. Rechargez la page avec Ctrl+F5.", "error");
      return;
    }
    try {
      var result = window.PrintellyColorSelection.magicExterior(
        remover.originalPixels,
        remover.currentMask,
        remover.previewWidth,
        remover.previewHeight,
        point.x * (remover.previewWidth - 1),
        point.y * (remover.previewHeight - 1),
        Number(ui.magicTolerance ? ui.magicTolerance.value : 18)
      );
      ui.targetColor.value = colorHex(result.color);
      if (!result.touchesExterior) {
        setMessage("Zone intérieure protégée : cliquez sur le fond situé autour du dessin et relié au bord de l’image.", "warning");
        return;
      }
      if (!result.count) {
        setMessage("Cette partie du fond extérieur est déjà transparente.", "success");
        return;
      }
      remover.actions.push({
        tool: "selection-erase",
        selection: new Uint8Array(result.mask),
        width: remover.previewWidth,
        height: remover.previewHeight,
        source: "magic-exterior"
      });
      remover.redo = [];
      rebuildMask();
      runQualityInspection(true);
      var percent = result.count * 100 / Math.max(1, remover.previewWidth * remover.previewHeight);
      setMessage(
        "Gomme magique : fond extérieur supprimé (" + percent.toFixed(1).replace(".", ",") +
        " %). Les zones intérieures sont protégées; utilisez Annuler si nécessaire.",
        "success"
      );
    } catch (error) {
      setMessage(error.message || "La gomme magique n’a pas pu analyser cette zone.", "error");
    }
  }

  function pointerDown(event) {
    if (!remover.sourceImage) return;
    ui.canvas.setPointerCapture(event.pointerId);
    remover.lastClientX = event.clientX;
    remover.lastClientY = event.clientY;
    if (remover.tool === "pan") {
      remover.panning = true;
      return;
    }
    if (remover.tool === "magic-exterior") {
      eraseMagicExterior(normalizedPoint(event));
      return;
    }
    if (remover.tool === "color-select" || remover.tool === "manual-background") {
      if (!remover.currentMask) {
        setMessage("Lancez d’abord l’analyse du sujet.", "warning");
        return;
      }
      var selectionPoint = normalizedPoint(event);
      if (remover.tool === "manual-background") {
        beginManualGuide(selectionPoint);
        renderPreview();
      } else {
        previewRemoval(selectionPoint);
      }
      return;
    }
    if (!remover.currentMask) {
      setMessage("Lancez d’abord l’analyse du sujet.", "warning");
      return;
    }
    remover.drawing = true;
    var stroke = {
      tool: remover.tool,
      size: Number(ui.brush.value) / Math.max(remover.previewWidth, remover.previewHeight),
      hardness: Number(ui.hardness.value) / 100,
      opacity: Number(ui.opacity.value) / 100,
      points: [normalizedPoint(event)]
    };
    remover.activeStroke = stroke;
    remover.actions.push(stroke);
    remover.redo = [];
    applyStroke(remover.currentMask, stroke);
    updateHistory();
    renderPreview();
  }

  function pointerMove(event) {
    updateCursor(event);
    if (remover.panning) {
      remover.panX += event.clientX - remover.lastClientX;
      remover.panY += event.clientY - remover.lastClientY;
      remover.lastClientX = event.clientX;
      remover.lastClientY = event.clientY;
      applyTransform();
      return;
    }
    if (!remover.drawing || !remover.activeStroke) return;
    var stroke = remover.activeStroke;
    var previousLength = stroke.points.length;
    var nextPoint = normalizedPoint(event);
    stroke.points.push(nextPoint);
    if (stroke.tool === "manual-guide") {
      paintManualGuideSegment(stroke.points[previousLength - 1], nextPoint);
    } else {
      applyStroke(remover.currentMask, stroke, Math.max(0, previousLength - 1));
    }
    renderPreview();
  }

  function pointerUp() {
    var wasManualGuide = remover.activeStroke && remover.activeStroke.tool === "manual-guide";
    remover.drawing = false;
    remover.panning = false;
    remover.activeStroke = null;
    if (wasManualGuide) finishManualGuide();
  }

  function updateCursor(event) {
    if (remover.tool === "pan" || remover.tool === "color-select" || remover.tool === "manual-background" || remover.tool === "magic-exterior" || !remover.currentMask) {
      ui.cursor.classList.add("hidden");
      return;
    }
    var shellRect = ui.shell.getBoundingClientRect();
    var canvasRect = ui.canvas.getBoundingClientRect();
    var size = Number(ui.brush.value) * (canvasRect.width / Math.max(1, remover.previewWidth));
    ui.cursor.style.width = size + "px";
    ui.cursor.style.height = size + "px";
    ui.cursor.style.left = event.clientX - shellRect.left + "px";
    ui.cursor.style.top = event.clientY - shellRect.top + "px";
    ui.cursor.classList.remove("hidden");
  }

  function setTool(tool) {
    remover.tool = tool;
    document.querySelectorAll("[data-br-tool]").forEach(function (button) {
      var active = button.dataset.brTool === tool;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
    ui.canvas.classList.toggle("is-brushing", tool === "protect" || tool === "erase");
    ui.shell.dataset.tool = tool;
    if (tool === "pan" || tool === "color-select" || tool === "manual-background" || tool === "magic-exterior") ui.cursor.classList.add("hidden");
    if (tool === "magic-exterior") setMessage("Gomme magique extérieure active : cliquez sur le fond autour du dessin.", "success");
  }

  function updateHistory() {
    ui.undo.disabled = remover.actions.length === 0;
    ui.redo.disabled = remover.redo.length === 0;
  }

  function setView(view) {
    remover.view = view;
    document.querySelectorAll("[data-br-view]").forEach(function (button) { button.classList.toggle("active", button.dataset.brView === view); });
    ui.splitControl.classList.toggle("hidden", view !== "split");
    renderPreview();
  }

  function setBackground(name) {
    remover.background = name;
    ui.shell.className = "br-canvas-shell br-bg-" + name;
    ui.shell.style.backgroundColor = "";
    document.querySelectorAll("[data-br-background]").forEach(function (button) { button.classList.toggle("active", button.dataset.brBackground === name); });
  }

  function paintSelectionAction(context, action, width, height) {
    var selectionCanvas = document.createElement("canvas");
    selectionCanvas.width = action.width;
    selectionCanvas.height = action.height;
    var selectionContext = selectionCanvas.getContext("2d");
    var imageData = selectionContext.createImageData(action.width, action.height);
    for (var index = 0, pixel = 0; index < action.selection.length; index += 1, pixel += 4) {
      if (!action.selection[index]) continue;
      imageData.data[pixel] = 255;
      imageData.data[pixel + 1] = 255;
      imageData.data[pixel + 2] = 255;
      imageData.data[pixel + 3] = 255;
    }
    selectionContext.putImageData(imageData, 0, 0);
    context.save();
    context.globalCompositeOperation = "destination-out";
    context.imageSmoothingEnabled = false;
    context.drawImage(selectionCanvas, 0, 0, width, height);
    context.restore();
    selectionCanvas.width = selectionCanvas.height = 1;
  }

  function paintMaskAction(context, action, width, height) {
    if (action.tool === "selection-erase") paintSelectionAction(context, action, width, height);
    else paintMaskStroke(context, action, width, height);
  }

  function paintMaskStroke(context, stroke, width, height) {
    var radius = stroke.size * Math.max(width, height) / 2;
    var hard = Math.max(0, Math.min(0.999, stroke.hardness));
    context.save();
    context.globalCompositeOperation = stroke.tool === "protect" ? "source-over" : "destination-out";
    for (var index = 0; index < stroke.points.length; index += 1) {
      var from = index ? stroke.points[index - 1] : stroke.points[index];
      var to = stroke.points[index];
      var dx = (to.x - from.x) * width;
      var dy = (to.y - from.y) * height;
      var distance = Math.sqrt(dx * dx + dy * dy);
      var steps = Math.max(1, Math.ceil(distance / Math.max(1, radius * 0.3)));
      for (var step = 0; step <= steps; step += 1) {
        var t = step / steps;
        var x = (from.x + (to.x - from.x) * t) * width;
        var y = (from.y + (to.y - from.y) * t) * height;
        var gradient = context.createRadialGradient(x, y, radius * hard, x, y, radius);
        var color = stroke.tool === "protect" ? "255,255,255" : "0,0,0";
        gradient.addColorStop(0, "rgba(" + color + "," + stroke.opacity + ")");
        gradient.addColorStop(1, "rgba(" + color + ",0)");
        context.fillStyle = gradient;
        context.beginPath();
        context.arc(x, y, radius, 0, Math.PI * 2);
        context.fill();
      }
    }
    context.restore();
  }

  function canvasToBlob(canvas) {
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (blob) {
        if (blob) resolve(blob);
        else reject(new Error("Le navigateur n’a pas pu encoder le PNG."));
      }, "image/png");
    });
  }

  function validateMaskForExport() {
    if (!remover.currentMask || !remover.currentMask.length) throw new Error("Aucun masque à exporter.");
    var minimum = 1;
    var maximum = 0;
    for (var index = 0; index < remover.currentMask.length; index += 1) {
      var alpha = remover.currentMask[index];
      var paletteIndex = remover.paletteAssignments ? remover.paletteAssignments[index] : -1;
      if (paletteIndex >= 0 && remover.paletteHidden[paletteIndex]) alpha = 0;
      minimum = Math.min(minimum, alpha);
      maximum = Math.max(maximum, alpha);
    }
    if (minimum >= 0.999) throw new Error("Aucun pixel transparent n’est présent. Effacez le fond ou relancez l’analyse.");
    if (maximum <= 0.001) throw new Error("Le sujet est entièrement transparent. Restaurez-le avant le téléchargement.");
  }

  async function buildEditedBlob() {
    if (!remover.resultBlob || !remover.resultImage) throw new Error("Aucun résultat à exporter.");
    validateMaskForExport();
    if (!remover.actions.length && !hasHiddenPaletteColors()) return remover.resultBlob;

    var width = remover.sourceImage.naturalWidth;
    var height = remover.sourceImage.naturalHeight;
    var maskCanvas = document.createElement("canvas");
    var outputCanvas = document.createElement("canvas");
    maskCanvas.width = outputCanvas.width = width;
    maskCanvas.height = outputCanvas.height = height;

    var maskContext = maskCanvas.getContext("2d");
    maskContext.drawImage(remover.resultImage, 0, 0, width, height);
    maskContext.globalCompositeOperation = "source-in";
    maskContext.fillStyle = "#fff";
    maskContext.fillRect(0, 0, width, height);
    maskContext.globalCompositeOperation = "source-over";
    remover.actions.forEach(function (action) { paintMaskAction(maskContext, action, width, height); });
    Object.keys(remover.paletteHidden).forEach(function (key) {
      if (!remover.paletteHidden[key]) return;
      var hiddenSelection = paletteMask(Number(key));
      if (hiddenSelection.mask && hiddenSelection.count) {
        paintSelectionAction(maskContext, {
          selection: hiddenSelection.mask,
          width: remover.previewWidth,
          height: remover.previewHeight
        }, width, height);
      }
    });

    var outputContext = outputCanvas.getContext("2d");
    outputContext.drawImage(remover.sourceImage, 0, 0, width, height);
    outputContext.globalCompositeOperation = "destination-in";
    outputContext.drawImage(maskCanvas, 0, 0);
    var blob = await canvasToBlob(outputCanvas);
    maskCanvas.width = maskCanvas.height = outputCanvas.width = outputCanvas.height = 1;
    return blob;
  }

  async function preparePrintBlob(blob) {
    var settings = currentPrintSettings();
    if (!settings || !window.PrintellyPrintExport) return blob;
    var output = blob;

    if (settings.mode === "resample" && (settings.outputWidth !== remover.sourceImage.naturalWidth || settings.outputHeight !== remover.sourceImage.naturalHeight)) {
      if (settings.outputWidth * settings.outputHeight > 40000000) {
        throw new Error("L’export dépasserait 40 mégapixels. Réduisez la taille ou le DPI.");
      }
      if (settings.scale > 1.5 && typeof window.confirm === "function" && !window.confirm(
        "Cet export agrandit fortement l’image (" + settings.scale.toFixed(1) + "×). Il ne peut pas inventer de vrais détails. Continuer ?"
      )) {
        throw new Error("Export annulé : choisissez une taille plus petite ou le mode métadonnée.");
      }
      var loaded = await loadImageFromBlob(output);
      try {
        var canvas = document.createElement("canvas");
        canvas.width = settings.outputWidth;
        canvas.height = settings.outputHeight;
        var context = canvas.getContext("2d");
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = "high";
        context.drawImage(loaded.image, 0, 0, settings.outputWidth, settings.outputHeight);
        output = await canvasToBlob(canvas);
        canvas.width = canvas.height = 1;
      } finally {
        URL.revokeObjectURL(loaded.url);
      }
    }
    return window.PrintellyPrintExport.embedPngDpi(output, settings.dpi);
  }

  async function buildFinalBlob() {
    return preparePrintBlob(await buildEditedBlob());
  }

  function downloadBlob(blob, fileName) {
    var url = URL.createObjectURL(blob);
    var anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName || remover.outputName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
  }

  async function exportAction(addToOrder) {
    if (!remover.resultBlob) return;
    ui.progress.classList.remove("hidden");
    ui.download.disabled = true;
    ui.add.disabled = true;
    var printSettings = updatePrintPanel(false);
    setMessage("Création du PNG transparent" + (printSettings ? " • " + printSettings.dpi + " DPI" : "") + "…", "");
    try {
      var blob = await buildFinalBlob();
      if (blob.type !== "image/png" || !blob.size) throw new Error("Le PNG final est invalide.");
      var exportName = window.PrintellyPrintExport && printSettings
        ? window.PrintellyPrintExport.outputName(remover.outputName, printSettings.dpi)
        : remover.outputName;
      if (addToOrder) {
        if (typeof state === "undefined" || !state.files || typeof renderFiles !== "function") {
          throw new Error("Le module de commande n’est pas disponible.");
        }
        var file = new File([blob], exportName, { type: "image/png", lastModified: Date.now() });
        state.files.push({ id: typeof uuid === "function" ? uuid() : String(Date.now()), file: file, width: "", height: "", quantity: 1, previewUrl: URL.createObjectURL(file) });
        renderFiles();
        if (typeof navigate === "function") navigate("newOrder");
        if (typeof toast === "function") toast("PNG transparent ajouté à la commande.");
      } else {
        downloadBlob(blob, exportName);
      }
      setMessage(addToOrder ? "PNG ajouté à votre nouvelle commande." : "PNG transparent téléchargé" + (printSettings ? " à " + printSettings.dpi + " DPI." : "."), "success");
    } catch (error) {
      setMessage(error.message || "Export impossible.", "error");
    } finally {
      ui.progress.classList.add("hidden");
      ui.download.disabled = false;
      ui.add.disabled = false;
    }
  }

  function resetAll() {
    if (remover.abortController) remover.abortController.abort();
    clearUrls();
    remover.file = null;
    remover.sourceImage = null;
    remover.resultImage = null;
    remover.resultBlob = null;
    remover.originalPixels = null;
    remover.sourceAlpha = null;
    remover.serverPixels = null;
    remover.baseMask = null;
    remover.currentMask = null;
    remover.actions = [];
    remover.redo = [];
    clearPendingSelection(false);
    clearPalette(false);
    clearQuality(false);
    ui.file.value = "";
    ui.canvas.width = ui.canvas.height = 1;
    ui.empty.classList.remove("hidden");
    ui.imageMeta.textContent = "Aucune image chargée";
    ui.resultInfo.textContent = "PNG transparent • dimensions originales";
    updateAnalyzeButton();
    ui.reset.disabled = true;
    ui.download.disabled = true;
    ui.add.disabled = true;
    ui.qualityInfo.querySelector("strong").textContent = "En attente d’analyse";
    ui.qualityInfo.querySelector("span").textContent = "Les zones ambiguës et les alertes apparaîtront ici.";
    updatePrintPanel(false);
    setMessage("", "");
    resetStages();
    fitPreview();
    updateHistory();
  }


  if (ui.printWidth) ui.printWidth.addEventListener("input", function () { updatePrintPanel(true); });
  if (ui.printHeight) ui.printHeight.addEventListener("input", function () { updatePrintPanel(true); });
  if (ui.printUnit) {
    ui.printUnit.dataset.previous = ui.printUnit.value;
    ui.printUnit.addEventListener("change", function () {
      var previous = ui.printUnit.dataset.previous || remover.printUnit || "cm";
      convertPrintUnit(previous, ui.printUnit.value);
      remover.printUnit = ui.printUnit.value;
      ui.printUnit.dataset.previous = ui.printUnit.value;
      updatePrintPanel(true);
    });
  }
  if (ui.exportDpi) ui.exportDpi.addEventListener("change", function () { updatePrintPanel(true); });
  if (ui.customDpi) ui.customDpi.addEventListener("input", function () { updatePrintPanel(true); });
  if (ui.dpiMode) ui.dpiMode.addEventListener("change", function () { updatePrintPanel(true); });
  if (ui.lockPrintRatio) ui.lockPrintRatio.addEventListener("change", function () { updatePrintPanel(true); });

  updatePrintPanel(false);

  ui.apiUrl.value = initialApiUrl();
  ui.apiUrl.addEventListener("change", function () {
    localStorage.setItem("printellyBackgroundApi", apiBase());
    testApi();
  });
  ui.testApi.addEventListener("click", testApi);
  ui.pick.addEventListener("click", function (event) { event.stopPropagation(); ui.file.click(); });
  ui.drop.addEventListener("click", function (event) { if (event.target !== ui.pick) ui.file.click(); });
  ui.drop.addEventListener("keydown", function (event) { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); ui.file.click(); } });
  ui.drop.addEventListener("dragover", function (event) { event.preventDefault(); ui.drop.classList.add("dragging"); });
  ui.drop.addEventListener("dragleave", function () { ui.drop.classList.remove("dragging"); });
  ui.drop.addEventListener("drop", function (event) { event.preventDefault(); ui.drop.classList.remove("dragging"); selectFile(event.dataTransfer.files[0]); });
  ui.file.addEventListener("change", function () { selectFile(ui.file.files[0]); });

  document.querySelectorAll("[data-br-mode]").forEach(function (button) {
    button.addEventListener("click", function () {
      remover.mode = button.dataset.brMode;
      if (remover.mode === "design") {
        ui.removeHaze.checked = true;
        ui.protectDetails.checked = true;
        ui.decontaminate.checked = true;
      }
      document.querySelectorAll("[data-br-mode]").forEach(function (item) { item.classList.toggle("active", item === button); });
    });
  });
  document.querySelectorAll("[data-br-tool]").forEach(function (button) {
    button.addEventListener("click", function () {
      if (button.dataset.brTool === "manual-background") {
        ui.removalMenu.open = true;
        ui.removalMethod.value = "manual";
        updateRemovalMethod();
      } else setTool(button.dataset.brTool);
    });
  });
  document.querySelectorAll("[data-br-view]").forEach(function (button) { button.addEventListener("click", function () { setView(button.dataset.brView); }); });
  document.querySelectorAll("[data-br-background]").forEach(function (button) { button.addEventListener("click", function () { setBackground(button.dataset.brBackground); }); });

  ui.previewColor.addEventListener("input", function () {
    remover.background = "custom";
    ui.shell.className = "br-canvas-shell br-bg-custom";
    ui.shell.style.backgroundColor = ui.previewColor.value;
    document.querySelectorAll("[data-br-background]").forEach(function (button) { button.classList.remove("active"); });
  });
  ui.useBackgroundColor.addEventListener("change", function () {
    ui.backgroundColor.disabled = !ui.useBackgroundColor.checked;
  });
  if (ui.blackBackgroundMode) ui.blackBackgroundMode.addEventListener("change", function () {
    var selected = ui.blackBackgroundMode.value;
    if (selected === "off") {
      setMessage("Mode fond noir désactivé : traitement universel.", "");
    } else if (selected === "exterior") {
      setMessage("Le noir relié aux bords sera supprimé; les zones noires intérieures resteront protégées.", "success");
    } else {
      setMessage("Le moteur supprimera aussi les grands fonds noirs intérieurs, tout en protégeant cheveux, barbe, ombres et textes.", "success");
    }
  });
  ui.removalMethod.addEventListener("change", updateRemovalMethod);
  ui.targetColor.addEventListener("input", function () {
    if (remover.currentMask && (ui.removalMethod.value === "global" || ui.removalMethod.value === "exterior")) previewRemoval();
    else clearPendingSelection(true);
  });
  ui.pickColor.addEventListener("click", function () {
    if (!remover.currentMask) { setMessage("Lancez d’abord l’analyse du sujet.", "warning"); return; }
    setTool(ui.removalMethod.value === "manual" ? "manual-background" : "color-select");
    setMessage("Cliquez maintenant sur la couleur ou la zone de fond dans l’image.", "success");
  });
  if (ui.magicTolerance) ui.magicTolerance.addEventListener("input", function () {
    ui.magicToleranceValue.textContent = ui.magicTolerance.value;
  });
  ui.colorTolerance.addEventListener("input", function () {
    ui.colorToleranceValue.textContent = ui.colorTolerance.value;
    if (remover.currentMask && (ui.removalMethod.value === "global" || ui.removalMethod.value === "exterior")) previewRemoval();
    else clearPendingSelection(true);
  });
  ui.previewRemoval.addEventListener("click", function () {
    if (ui.removalMethod.value === "manual") {
      setTool("manual-background");
      setMessage("Dessinez dans le fond oublié. Le moteur suivra sa couleur et ses petites variations sans quitter la zone proche.", "success");
    } else previewRemoval();
  });
  ui.applyRemoval.addEventListener("click", applyPendingSelection);
  ui.cancelRemoval.addEventListener("click", function () { clearPendingSelection(true); setMessage("Prévisualisation annulée.", ""); });
  ui.analyzeColors.addEventListener("click", function () { analyzeColors(false); });
  ui.showAllColors.addEventListener("click", showAllPaletteColors);
  ui.previewColorRemoval.addEventListener("click", function () {
    if (remover.paletteSelectedIndex >= 0) selectPaletteColor(remover.paletteSelectedIndex);
  });
  ui.deleteSelectedColor.addEventListener("click", deleteSelectedPaletteColor);
  ui.runQuality.addEventListener("click", function () { runQualityInspection(false); });
  ui.nextIssue.addEventListener("click", focusNextQualityIssue);
  ui.cleanMicro.addEventListener("click", previewMicroCleanup);
  if (ui.downloadQualityReport) ui.downloadQualityReport.addEventListener("click", downloadQualityReport);
  ui.printWidth.addEventListener("change", function () { if (remover.currentMask) runQualityInspection(true); });
  ui.microLimit.addEventListener("change", function () { if (remover.currentMask) runQualityInspection(true); });
  ui.feather.addEventListener("input", function () { ui.featherValue.textContent = Number(ui.feather.value).toFixed(1).replace(".", ",") + " px"; });
  ui.edge.addEventListener("input", function () { ui.edgeValue.textContent = ui.edge.value + " px"; });
  ui.brush.addEventListener("input", function () { ui.brushValue.textContent = ui.brush.value + " px"; });
  ui.hardness.addEventListener("input", function () { ui.hardnessValue.textContent = ui.hardness.value + " %"; });
  ui.opacity.addEventListener("input", function () { ui.opacityValue.textContent = ui.opacity.value + " %"; });
  ui.split.addEventListener("input", function () { ui.splitValue.textContent = ui.split.value + " %"; renderPreview(); });

  ui.analyze.addEventListener("click", analyze);
  ui.cancel.addEventListener("click", function () { if (remover.abortController) remover.abortController.abort(); });
  ui.undo.addEventListener("click", function () { if (remover.actions.length) { remover.redo.push(remover.actions.pop()); rebuildMask(); runQualityInspection(true); } });
  ui.redo.addEventListener("click", function () { if (remover.redo.length) { remover.actions.push(remover.redo.pop()); rebuildMask(); runQualityInspection(true); } });
  ui.zoomIn.addEventListener("click", function () { changeZoom(1.25); });
  ui.zoomOut.addEventListener("click", function () { changeZoom(0.8); });
  ui.fit.addEventListener("click", fitPreview);
  ui.reset.addEventListener("click", resetAll);
  ui.download.addEventListener("click", function () { exportAction(false); });
  ui.add.addEventListener("click", function () { exportAction(true); });

  ui.canvas.addEventListener("pointerdown", pointerDown);
  ui.canvas.addEventListener("pointermove", pointerMove);
  ui.canvas.addEventListener("pointerup", pointerUp);
  ui.canvas.addEventListener("pointercancel", pointerUp);
  ui.canvas.addEventListener("pointerleave", function () { ui.cursor.classList.add("hidden"); });
  ui.canvas.addEventListener("wheel", function (event) {
    if (!remover.sourceImage) return;
    event.preventDefault();
    changeZoom(event.deltaY < 0 ? 1.15 : 0.87);
  }, { passive: false });

  document.addEventListener("keydown", function (event) {
    var target = event.target;
    if (target && (target.matches("input,textarea,select") || target.isContentEditable)) return;
    var key = event.key.toLowerCase();
    if (key === "escape" && document.body.classList.contains("br-studio-active")) {
      event.preventDefault();
      setExpandedWorkspace(false);
      return;
    }
    if ((event.ctrlKey || event.metaKey) && key === "z") {
      event.preventDefault();
      if (event.shiftKey) ui.redo.click(); else ui.undo.click();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && key === "y") {
      event.preventDefault();
      ui.redo.click();
      return;
    }
    if (!document.body.classList.contains("br-studio-active")) return;
    if (key === "b") setTool("protect");
    else if (key === "e") setTool("erase");
    else if (key === "m") setTool("magic-exterior");
    else if (key === "r") setTool("protect");
    else if (key === "f") fitPreview();
    else if (key === "h") setView("mask");
    else if (key === "o") setView("original");
    else if (key === "v" || event.code === "Space") setTool("pan");
  });

  window.addEventListener("resize", function () { if (remover.zoom === 1) { sizeCanvasToShell(); applyTransform(); } });
  if (ui.closePackDialog) ui.closePackDialog.addEventListener("click", closePackDialog);
  if (ui.refreshEntitlement) ui.refreshEntitlement.addEventListener("click", async function () {
    var allowed = await refreshEntitlement(false);
    if (allowed) closePackDialog();
  });
  if (ui.packDialog) ui.packDialog.addEventListener("click", function (event) {
    if (event.target === ui.packDialog) closePackDialog();
  });
  window.addEventListener("printelly:studio-entitlement", function (event) {
    var detail = event && event.detail ? event.detail : {};
    renderEntitlement({
      quota: {
        available: detail.available, reserved: detail.reserved, plan: detail.plan,
        expires_at: detail.expiresAt, access_reason: detail.accessReason,
        trial_available: detail.trialAvailable, paid_available: detail.paidAvailable
      },
      entitlement: {
        access_allowed: detail.accessAllowed, access_reason: detail.accessReason,
        trial_available: detail.trialAvailable, trial_consumed: detail.trialConsumed,
        paid_available: detail.paidAvailable, subscription_active: detail.subscriptionActive
      }
    });
  });
  window.addEventListener("focus", function () { refreshEntitlement(true); });
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) refreshEntitlement(true);
  });
  remover.entitlementTimer = setInterval(function () {
    if (!document.hidden && !remover.processing) refreshEntitlement(true);
  }, 15000);
  window.addEventListener("beforeunload", function () {
    clearUrls();
    if (remover.entitlementTimer) clearInterval(remover.entitlementTimer);
  });
  setTool("pan");
  setBackground("checker");
  updateRemovalMethod();
  testApi();
})();
