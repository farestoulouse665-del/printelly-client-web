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
    removalHint: document.getElementById("brRemovalHint"),
    previewRemoval: document.getElementById("brPreviewRemoval"),
    applyRemoval: document.getElementById("brApplyRemoval"),
    cancelRemoval: document.getElementById("brCancelRemoval"),
    paletteMenu: document.getElementById("brPaletteMenu"),
    paletteCount: document.getElementById("brPaletteCount"),
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
    printWidth: document.getElementById("brPrintWidth"),
    microLimit: document.getElementById("brMicroLimit"),
    runQuality: document.getElementById("brRunQuality"),
    nextIssue: document.getElementById("brNextIssue"),
    cleanMicro: document.getElementById("brCleanMicro"),
    qualitySummary: document.getElementById("brQualitySummary"),
    qualityIssues: document.getElementById("brQualityIssues"),
    qualityCertificate: document.getElementById("brQualityCertificate"),
    createSnapshot: document.getElementById("brCreateSnapshot"),
    snapshotList: document.getElementById("brSnapshotList"),
    snapshotCount: document.getElementById("brSnapshotCount"),
    scanResidues: document.getElementById("brScanResidues"),
    forgottenClick: document.getElementById("brForgottenClick"),
    multiPoint: document.getElementById("brMultiPoint"),
    assistantStatus: document.getElementById("brAssistantStatus")
  };

  if (!ui.canvas) return;

  function setupProfessionalStudio() {
    if (!ui.workspace || !ui.leftControls || !ui.rightControls) return;

    var correctionSection = ui.removalMenu ? ui.removalMenu.closest(".br-control-section") : null;
    var exportPanel = document.querySelector(".br-export-panel");
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
    qualityReport: null,
    qualityIssueIndex: -1,
    snapshots: [],
    snapshotSequence: 0,
    multiPointMode: false,
    drawing: false,
    panning: false,
    activeStroke: null,
    lastClientX: 0,
    lastClientY: 0,
    abortController: null,
    progressTimers: [],
    outputName: "image-sans-fond.png"
  };

  function apiBase() {
    return (ui.apiUrl.value || "").trim().replace(/\/+$/, "");
  }

  function apiEndpoint(path) {
    return apiBase() + path;
  }

  function initialApiUrl() {
    var saved = localStorage.getItem("printellyBackgroundApi");
    if (saved !== null) return saved;
    return "http://localhost:8000";
  }

  function setMessage(text, type) {
    ui.message.textContent = text || "";
    ui.message.className = "br-message" + (type ? " " + type : "");
  }

  function setApiState(text, stateName) {
    ui.apiStatus.textContent = text;
    ui.apiStatus.dataset.state = stateName;
  }

  async function testApi() {
    var url = apiEndpoint("/api/health");
    setApiState("Vérification…", "checking");
    try {
      if (!window.PrintellyBackgroundApi) throw new Error("Client API non chargé.");
      var data = await window.PrintellyBackgroundApi.health(apiBase());
      if (!data.model_loaded) {
        setApiState("Modèle non prêt", "error");
        setMessage(data.status || "Le serveur répond, mais le modèle ONNX n’est pas chargé.", "warning");
        return false;
      }
      setApiState("Moteur prêt • " + data.device.toUpperCase(), "ready");
      setMessage("Serveur privé connecté. Aucune API d’image externe n’est utilisée.", "success");
      return true;
    } catch (error) {
      setApiState("Serveur inaccessible", "error");
      setMessage("Impossible de joindre " + (url || "/api/health") + ". Lancez le serveur local ou indiquez son adresse HTTPS.", "error");
      return false;
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

  async function selectFile(file) {
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setMessage("Format refusé. Choisissez un PNG, JPEG ou WebP.", "error");
      return;
    }
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
        setMessage("La résolution dépasse 40 mégapixels.", "error");
        return;
      }
      remover.file = file;
      remover.sourceImage = loaded.image;
      remover.sourceUrl = loaded.url;
      remover.outputName = safeOutputName(file.name);
      prepareOriginalPreview();
      ui.empty.classList.add("hidden");
      ui.analyze.disabled = false;
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
        printWidthCm: Number(ui.printWidth.value),
        sourceWidth: remover.sourceImage.naturalWidth,
        microPixelLimit: Number(ui.microLimit.value)
      }
    );
    remover.qualityIssueIndex = -1;
    renderQualityReport();
    if (!silent) setMessage("Contrôle DTF terminé : " + remover.qualityReport.score + " / 100.", remover.qualityReport.score >= 75 ? "success" : "warning");
    return remover.qualityReport;
  }

  function renderQualityReport() {
    var report = remover.qualityReport;
    if (!report) return;
    ui.qualityScore.dataset.state = report.status;
    ui.qualityScore.querySelector("strong").textContent = report.score;
    var dpiText = report.dpi ? Math.round(report.dpi) + " DPI" : "taille d’impression non définie";
    ui.qualitySummary.innerHTML = "<p><strong>" + (report.issues.length ? report.issues.length + " point(s) à vérifier" : "Aucun défaut critique détecté") + "</strong><br>" +
      dpiText + " • " + (report.transparentRatio * 100).toFixed(1).replace(".", ",") + " % transparent • " +
      (report.semiTransparentRatio * 100).toFixed(1).replace(".", ",") + " % semi-transparent.</p>";
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
      content.appendChild(title);
      content.appendChild(message);
      var locate = document.createElement("button");
      locate.type = "button";
      locate.className = "secondary";
      locate.textContent = issue.bbox ? "VOIR" : "INFO";
      locate.disabled = !issue.bbox;
      locate.addEventListener("click", function () { focusQualityIssue(index); });
      item.appendChild(indicator);
      item.appendChild(content);
      item.appendChild(locate);
      ui.qualityIssues.appendChild(item);
    });
    if (!report.issues.length) ui.qualityIssues.innerHTML = '<div class="br-quality-issue"><i style="background:#23956b"></i><div><strong>Design prêt</strong><span>Aucun défaut critique n’a été détecté automatiquement.</span></div></div>';
    ui.nextIssue.disabled = !report.issues.some(function (issue) { return issue.bbox; });
    ui.cleanMicro.disabled = !report.microCount;
    ui.runQuality.disabled = false;
    ui.qualityCertificate.classList.remove("hidden");
    ui.qualityCertificate.textContent =
      "PRINTELLY — CONTRÔLE DTF\n" +
      (report.transparentRatio > 0 ? "✓ Transparence réelle\n" : "✗ Aucune transparence\n") +
      "✓ Dimensions originales conservées\n" +
      (report.dpi >= 250 ? "✓ Résolution adaptée : " : report.dpi ? "⚠ Résolution à vérifier : " : "• Résolution : ") + (report.dpi ? Math.round(report.dpi) + " DPI\n" : "taille non définie\n") +
      (report.microCount ? "⚠ " + report.microCount + " micro-pixel(s) isolé(s)\n" : "✓ Aucun micro-fragment important\n") +
      (report.holes.length ? "⚠ " + report.holes.length + " trou(s) intérieur(s) à vérifier\n" : "✓ Aucun petit trou suspect\n") +
      "SCORE FINAL : " + report.score + " / 100";
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
    clearSnapshots();
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
    ui.analyze.disabled = processing || !remover.file;
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

    remover.progressTimers.push(setTimeout(function () { stage("segment", "active"); setMessage("Le modèle local détecte le sujet et ses détails…", ""); }, 350));
    remover.progressTimers.push(setTimeout(function () { stage("refine", "active"); setMessage("Récupération du fond, de l’alpha et des micro-détails…", ""); }, 1800));

    try {
      if (!window.PrintellyBackgroundApi) throw new Error("Client API non chargé.");
      var apiResult = await window.PrintellyBackgroundApi.remove(apiBase(), remover.file, {
        mode: remover.mode,
        feather: Number(ui.feather.value),
        edgeShift: Number(ui.edge.value),
        decontaminate: ui.decontaminate.checked,
        backgroundCleanup: ui.backgroundCleanup.value,
        removeHaze: ui.removeHaze.checked,
        protectDetails: ui.protectDetails.checked,
        backgroundColor: ui.useBackgroundColor.checked ? ui.backgroundColor.value : ""
      }, remover.abortController.signal);

      stage("verify", "active");
      var blob = apiResult.blob;
      var loaded = await loadImageFromBlob(blob);
      if (loaded.image.naturalWidth !== remover.sourceImage.naturalWidth || loaded.image.naturalHeight !== remover.sourceImage.naturalHeight) {
        URL.revokeObjectURL(loaded.url);
        throw new Error("Le serveur a modifié les dimensions de l’image.");
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
      var warnings = Array.isArray(apiResult.metadata.warnings)
        ? apiResult.metadata.warnings
        : [];
      updateQuality(model, processingMs, ratio, residualHaze, warnings);
      ui.resultInfo.textContent = "PNG RGBA • " + remover.sourceImage.naturalWidth + " × " + remover.sourceImage.naturalHeight + " px";
      ui.download.disabled = false;
      ui.add.disabled = false;
      if (ui.createSnapshot) ui.createSnapshot.disabled = false;
      setMessage(warnings.length ? "Résultat créé avec " + warnings.length + " zone à vérifier." : "Fond supprimé. Vérifiez les contours avant l’export.", warnings.length ? "warning" : "success");
      renderPreview();
    } catch (error) {
      if (error.name === "AbortError") {
        setMessage("Traitement annulé. L’image originale est toujours disponible.", "warning");
        resetStages();
      } else {
        var active = ui.stages.querySelector("li.active");
        if (active) {
          active.classList.remove("active");
          active.classList.add("error");
        }
        setMessage(error.message || "Le traitement a échoué.", "error");
      }
    } finally {
      clearProgressTimers();
      setProcessing(false);
      remover.abortController = null;
    }
  }

  function updateQuality(model, milliseconds, ratio, residualHaze, warnings) {
    var percent = Math.round(ratio * 100);
    var hazePercent = Math.min(100, Math.max(0, residualHaze * 100));
    ui.backgroundInfo.querySelector("strong").textContent = "Sujet détecté • " + percent + " % de l’image";
    ui.backgroundInfo.querySelector("span").textContent = "Moteur " + model + (milliseconds ? " • " + (milliseconds / 1000).toFixed(1).replace(".", ",") + " s" : "") + " • résidu " + hazePercent.toFixed(1).replace(".", ",") + " %";
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
    remover.paletteSelectedIndex = -1;
    if (ui.paletteCount) ui.paletteCount.textContent = "Non analysées";
    if (ui.paletteList) ui.paletteList.innerHTML = "<p>Analysez d’abord le sujet, puis détectez les couleurs du design.</p>";
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

  function renderPalette() {
    if (!ui.paletteList) return;
    ui.paletteList.innerHTML = "";
    if (!remover.paletteColors.length) {
      ui.paletteList.innerHTML = "<p>Aucune couleur dominante détectée dans le sujet visible.</p>";
      return;
    }
    remover.paletteColors.forEach(function (color, index) {
      var item = document.createElement("div");
      item.className = "br-palette-item";
      if (index === remover.paletteSelectedIndex) item.classList.add("selected");
      if (remover.paletteHidden[index]) item.classList.add("hidden-color");

      var swatch = document.createElement("span");
      swatch.className = "br-palette-swatch";
      swatch.style.backgroundColor = colorHex(color);

      var meta = document.createElement("div");
      meta.className = "br-palette-meta";
      var title = document.createElement("strong");
      title.textContent = "Couleur " + (index + 1) + " • " + colorHex(color).toUpperCase();
      var detail = document.createElement("small");
      detail.textContent = (color.ratio * 100).toFixed(1).replace(".", ",") + " % du sujet";
      meta.appendChild(title);
      meta.appendChild(detail);

      var buttons = document.createElement("div");
      buttons.className = "br-palette-buttons";
      var eye = document.createElement("button");
      eye.type = "button";
      eye.textContent = remover.paletteHidden[index] ? "○" : "●";
      eye.title = remover.paletteHidden[index] ? "Afficher cette couleur" : "Masquer temporairement cette couleur";
      eye.addEventListener("click", function () {
        remover.paletteHidden[index] = !remover.paletteHidden[index];
        renderPalette();
        renderPreview();
      });
      var isolate = document.createElement("button");
      isolate.type = "button";
      isolate.textContent = "ISO";
      isolate.title = "Isoler cette couleur";
      isolate.addEventListener("click", function () {
        remover.paletteColors.forEach(function (_, colorIndex) { remover.paletteHidden[colorIndex] = colorIndex !== index; });
        remover.paletteSelectedIndex = index;
        renderPalette();
        renderPreview();
        setMessage("Couleur isolée. Les autres couleurs sont seulement masquées, pas supprimées.", "success");
      });
      var choose = document.createElement("button");
      choose.type = "button";
      choose.textContent = "✓";
      choose.title = "Sélectionner cette couleur";
      choose.addEventListener("click", function () { selectPaletteColor(index); });
      buttons.appendChild(eye);
      buttons.appendChild(isolate);
      buttons.appendChild(choose);

      item.appendChild(swatch);
      item.appendChild(meta);
      item.appendChild(buttons);
      ui.paletteList.appendChild(item);
    });
    ui.paletteCount.textContent = remover.paletteColors.length + " couleur" + (remover.paletteColors.length > 1 ? "s" : "");
    ui.showAllColors.disabled = false;
    ui.previewColorRemoval.disabled = remover.paletteSelectedIndex < 0;
    ui.deleteSelectedColor.disabled = remover.paletteSelectedIndex < 0;
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
      manual: "Dessinez sur le fond oublié. Seuls les pixels de fond situés dans la zone peinte seront sélectionnés."
    };
    ui.removalHint.textContent = descriptions[method];
    ui.removalHint.classList.toggle("warning", method === "global");
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
      var result = window.PrintellyColorSelection.guidedSelection(
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
      if (result.count) setMessage("Zone affinée en rose. Dessinez ailleurs pour l’agrandir ou cliquez sur Rendre transparent.", "success");
    } catch (error) {
      remover.manualGuide = null;
      setMessage(error.message, "warning");
      renderPreview();
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
    if (remover.tool === "pan" || remover.tool === "color-select" || remover.tool === "manual-background" || !remover.currentMask) {
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
    if (tool === "pan" || tool === "color-select" || tool === "manual-background") ui.cursor.classList.add("hidden");
  }

  function cloneStudioAction(action) {
    var copy = Object.assign({}, action);
    if (action.points) copy.points = action.points.map(function (point) { return { x: point.x, y: point.y }; });
    if (action.selection) copy.selection = new Uint8Array(action.selection);
    return copy;
  }

  function clearSnapshots() {
    remover.snapshots = [];
    remover.snapshotSequence = 0;
    if (ui.createSnapshot) ui.createSnapshot.disabled = true;
    renderSnapshots();
  }

  function renderSnapshots() {
    if (!ui.snapshotList || !ui.snapshotCount) return;
    var count = remover.snapshots.length;
    ui.snapshotCount.textContent = count + (count > 1 ? " instantanés" : " instantané");
    if (!count) {
      ui.snapshotList.innerHTML = "<p>Aucun instantané enregistré.</p>";
      return;
    }
    ui.snapshotList.innerHTML = "";
    remover.snapshots.slice().reverse().forEach(function (snapshot) {
      var item = document.createElement("div");
      item.className = "br-snapshot-item";
      var info = document.createElement("div");
      var title = document.createElement("strong");
      title.textContent = snapshot.name;
      var meta = document.createElement("small");
      meta.textContent = snapshot.actions.length + " correction(s) • " + snapshot.time;
      info.appendChild(title);
      info.appendChild(meta);
      var restore = document.createElement("button");
      restore.type = "button";
      restore.className = "secondary";
      restore.textContent = "RESTAURER";
      restore.addEventListener("click", function () { restoreSnapshot(snapshot.id); });
      item.appendChild(info);
      item.appendChild(restore);
      ui.snapshotList.appendChild(item);
    });
  }

  function createSnapshot(label, automatic) {
    if (!remover.currentMask) return;
    remover.snapshotSequence += 1;
    var snapshot = {
      id: Date.now() + "-" + remover.snapshotSequence,
      name: label || "Version " + remover.snapshotSequence,
      time: new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
      actions: remover.actions.map(cloneStudioAction),
      paletteHidden: Object.assign({}, remover.paletteHidden),
      view: remover.view
    };
    remover.snapshots.push(snapshot);
    if (remover.snapshots.length > 10) remover.snapshots.shift();
    if (ui.createSnapshot) ui.createSnapshot.disabled = false;
    renderSnapshots();
    if (!automatic) setMessage("Instantané enregistré. Vous pouvez revenir à cette version à tout moment.", "success");
  }

  function restoreSnapshot(id) {
    var snapshot = remover.snapshots.find(function (item) { return item.id === id; });
    if (!snapshot || !remover.baseMask) return;
    remover.actions = snapshot.actions.map(cloneStudioAction);
    remover.redo = [];
    remover.paletteHidden = Object.assign({}, snapshot.paletteHidden);
    rebuildMask();
    setView(snapshot.view || "result");
    if (typeof renderPalette === "function") renderPalette();
    setMessage("Version restaurée sans modifier l’image originale.", "success");
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

  async function buildFinalBlob() {
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

  function downloadBlob(blob) {
    var url = URL.createObjectURL(blob);
    var anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = remover.outputName;
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
    setMessage("Création du PNG transparent dans les dimensions originales…", "");
    try {
      var blob = await buildFinalBlob();
      if (blob.type !== "image/png" || !blob.size) throw new Error("Le PNG final est invalide.");
      if (addToOrder) {
        if (typeof state === "undefined" || !state.files || typeof renderFiles !== "function") {
          throw new Error("Le module de commande n’est pas disponible.");
        }
        var file = new File([blob], remover.outputName, { type: "image/png", lastModified: Date.now() });
        state.files.push({ id: typeof uuid === "function" ? uuid() : String(Date.now()), file: file, width: "", height: "", quantity: 1, previewUrl: URL.createObjectURL(file) });
        renderFiles();
        if (typeof navigate === "function") navigate("newOrder");
        if (typeof toast === "function") toast("PNG transparent ajouté à la commande.");
      } else {
        downloadBlob(blob);
      }
      setMessage(addToOrder ? "PNG ajouté à votre nouvelle commande." : "PNG transparent téléchargé.", "success");
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
    clearSnapshots();
    ui.file.value = "";
    ui.canvas.width = ui.canvas.height = 1;
    ui.empty.classList.remove("hidden");
    ui.imageMeta.textContent = "Aucune image chargée";
    ui.resultInfo.textContent = "PNG transparent • dimensions originales";
    ui.analyze.disabled = true;
    ui.reset.disabled = true;
    ui.download.disabled = true;
    ui.add.disabled = true;
    ui.qualityInfo.querySelector("strong").textContent = "En attente d’analyse";
    ui.qualityInfo.querySelector("span").textContent = "Les zones ambiguës et les alertes apparaîtront ici.";
    setMessage("", "");
    resetStages();
    fitPreview();
    updateHistory();
  }

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
  ui.colorTolerance.addEventListener("input", function () {
    ui.colorToleranceValue.textContent = ui.colorTolerance.value;
    if (remover.currentMask && (ui.removalMethod.value === "global" || ui.removalMethod.value === "exterior")) previewRemoval();
    else clearPendingSelection(true);
  });
  ui.previewRemoval.addEventListener("click", function () {
    if (ui.removalMethod.value === "manual") {
      setTool("manual-background");
      setMessage("Maintenez le clic et dessinez sur le fond oublié. La sélection restera limitée à la zone peinte.", "success");
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
  if (ui.scanResidues) ui.scanResidues.addEventListener("click", function () {
    if (!remover.currentMask) { setMessage("Lancez d’abord l’analyse du sujet.", "warning"); return; }
    runQualityInspection(false);
    setView("ambiguous");
    var issues = remover.qualityReport && remover.qualityReport.issues ? remover.qualityReport.issues.length : 0;
    ui.assistantStatus.textContent = issues ? issues + " zone(s) suspecte(s) affichée(s). Utilisez Erreur suivante pour les examiner." : "Aucun résidu important détecté.";
    setMessage(ui.assistantStatus.textContent, issues ? "warning" : "success");
  });
  if (ui.forgottenClick) ui.forgottenClick.addEventListener("click", function () {
    if (!remover.currentMask) { setMessage("Lancez d’abord l’analyse du sujet.", "warning"); return; }
    remover.multiPointMode = false;
    ui.removalMethod.value = "manual";
    ui.removalMenu.open = true;
    setTool("color-select");
    ui.assistantStatus.textContent = "Cliquez sur un morceau de fond oublié : seule sa région connectée sera sélectionnée.";
    setMessage(ui.assistantStatus.textContent, "success");
  });
  if (ui.multiPoint) ui.multiPoint.addEventListener("click", function () {
    if (!remover.currentMask) { setMessage("Lancez d’abord l’analyse du sujet.", "warning"); return; }
    remover.multiPointMode = !remover.multiPointMode;
    ui.multiPoint.classList.toggle("active", remover.multiPointMode);
    ui.multiPoint.setAttribute("aria-pressed", remover.multiPointMode ? "true" : "false");
    ui.removalMethod.value = "manual";
    ui.removalMenu.open = true;
    setTool(remover.multiPointMode ? "color-select" : "pan");
    ui.assistantStatus.textContent = remover.multiPointMode ? "Multipoints actif : cliquez sur plusieurs morceaux ou couleurs, puis rendez-les transparents." : "Sélection multipoints terminée.";
    setMessage(ui.assistantStatus.textContent, "success");
  });
  ui.runQuality.addEventListener("click", function () { runQualityInspection(false); });
  ui.nextIssue.addEventListener("click", focusNextQualityIssue);
  ui.cleanMicro.addEventListener("click", previewMicroCleanup);
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
    else if (key === "r") setTool("protect");
    else if (key === "f") fitPreview();
    else if (key === "h") setView("mask");
    else if (key === "o") setView("original");
    else if (key === "v" || event.code === "Space") setTool("pan");
  });

  window.addEventListener("resize", function () { if (remover.zoom === 1) { sizeCanvasToShell(); applyTransform(); } });
  window.addEventListener("beforeunload", clearUrls);
  setTool("pan");
  setBackground("checker");
  updateRemovalMethod();
  testApi();
})();
