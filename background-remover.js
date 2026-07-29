(function () {
  "use strict";

  var ui = {
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
    message: document.getElementById("brMessage")
  };

  if (!ui.canvas) return;

  var remover = {
    file: null,
    sourceImage: null,
    sourceUrl: "",
    resultImage: null,
    resultUrl: "",
    resultBlob: null,
    originalPreview: document.createElement("canvas"),
    originalPixels: null,
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
    if ((location.hostname === "localhost" || location.hostname === "127.0.0.1") && location.port === "8080") return "";
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
      var response = await fetch(url, { method: "GET", cache: "no-store" });
      var data = await response.json();
      if (!response.ok || !data.model_loaded) {
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
    if (file.size > 20 * 1024 * 1024) {
      setMessage("Le fichier dépasse la limite de 20 Mo.", "error");
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
    ui.canvas.width = remover.previewWidth;
    ui.canvas.height = remover.previewHeight;
    fitPreview();
  }

  function formatBytes(bytes) {
    if (bytes < 1024 * 1024) return Math.max(1, Math.round(bytes / 1024)) + " Ko";
    return (bytes / (1024 * 1024)).toFixed(1).replace(".", ",") + " Mo";
  }

  function clearResult(render) {
    if (remover.resultUrl) URL.revokeObjectURL(remover.resultUrl);
    remover.resultUrl = "";
    remover.resultBlob = null;
    remover.resultImage = null;
    remover.baseMask = null;
    remover.currentMask = null;
    remover.actions = [];
    remover.redo = [];
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
    if (remover.abortController) remover.abortController.abort();
    remover.abortController = new AbortController();
    clearResult(false);
    clearProgressTimers();
    resetStages();
    setProcessing(true);
    setMessage("Analyse de l’image en cours…", "");
    stage("upload", "active");

    var form = new FormData();
    form.append("image", remover.file, remover.file.name);
    form.append("mode", remover.mode);
    form.append("refine", "true");
    form.append("feather", ui.feather.value);
    form.append("edge_shift", ui.edge.value);
    form.append("decontaminate", ui.decontaminate.checked ? "true" : "false");

    remover.progressTimers.push(setTimeout(function () { stage("segment", "active"); setMessage("Le modèle local détecte le sujet et ses détails…", ""); }, 350));
    remover.progressTimers.push(setTimeout(function () { stage("refine", "active"); setMessage("Raffinement des cheveux, tissus et contours…", ""); }, 1800));

    try {
      var response = await fetch(apiEndpoint("/api/remove-background"), {
        method: "POST",
        body: form,
        signal: remover.abortController.signal
      });
      if (!response.ok) throw new Error(await errorDetail(response));
      if (!(response.headers.get("content-type") || "").includes("image/png")) throw new Error("Le serveur n’a pas retourné un PNG.");

      stage("verify", "active");
      var blob = await response.blob();
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

      var processingMs = Number(response.headers.get("x-processing-ms") || 0);
      var ratio = Number(response.headers.get("x-foreground-ratio") || 0);
      var model = response.headers.get("x-model-name") || "modèle local";
      var warnings = [];
      try { warnings = JSON.parse(response.headers.get("x-warnings") || "[]"); } catch (_) {}
      updateQuality(model, processingMs, ratio, warnings);
      ui.resultInfo.textContent = "PNG RGBA • " + remover.sourceImage.naturalWidth + " × " + remover.sourceImage.naturalHeight + " px";
      ui.download.disabled = false;
      ui.add.disabled = false;
      setMessage(warnings.length ? "Résultat créé avec " + warnings.length + " zone à vérifier." : "Fond supprimé. Vérifiez les contours avant l’export.", warnings.length ? "warning" : "success");
      renderPreview();
    } catch (error) {
      if (error.name === "AbortError") {
        setMessage("Traitement annulé. L’image originale est toujours disponible.", "warning");
        resetStages();
      } else {
        var active = ui.stages.querySelector("li.active");
        if (active) active.classList.add("error");
        setMessage(error.message || "Le traitement a échoué.", "error");
      }
    } finally {
      clearProgressTimers();
      setProcessing(false);
      remover.abortController = null;
    }
  }

  function updateQuality(model, milliseconds, ratio, warnings) {
    var percent = Math.round(ratio * 100);
    ui.backgroundInfo.querySelector("strong").textContent = "Sujet détecté • " + percent + " % de l’image";
    ui.backgroundInfo.querySelector("span").textContent = "Moteur " + model + (milliseconds ? " • " + (milliseconds / 1000).toFixed(1).replace(".", ",") + " s" : "");
    ui.qualityInfo.classList.toggle("warning", warnings.length > 0);
    ui.qualityInfo.querySelector("strong").textContent = warnings.length ? "Vérification recommandée" : "Contrôle automatique réussi";
    ui.qualityInfo.querySelector("span").textContent = warnings.length ? warnings.join(" ") : "Le masque contient un sujet visible et de véritables pixels transparents.";
  }

  function buildBaseMask() {
    var canvas = document.createElement("canvas");
    canvas.width = remover.previewWidth;
    canvas.height = remover.previewHeight;
    var context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(remover.resultImage, 0, 0, canvas.width, canvas.height);
    var data = context.getImageData(0, 0, canvas.width, canvas.height).data;
    remover.baseMask = new Float32Array(canvas.width * canvas.height);
    for (var index = 0, pixel = 0; index < remover.baseMask.length; index += 1, pixel += 4) {
      remover.baseMask[index] = data[pixel + 3] / 255;
    }
    rebuildMask();
  }

  function rebuildMask() {
    if (!remover.baseMask) return;
    remover.currentMask = new Float32Array(remover.baseMask);
    remover.actions.forEach(function (stroke) { applyStroke(remover.currentMask, stroke); });
    updateHistory();
    renderPreview();
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
        mask[offset] = stroke.tool === "protect"
          ? mask[offset] + (1 - mask[offset]) * weight
          : mask[offset] * (1 - weight);
      }
    }
  }

  function resultPixels() {
    var output = new ImageData(new Uint8ClampedArray(remover.originalPixels.data), remover.previewWidth, remover.previewHeight);
    if (!remover.currentMask) return output;
    for (var index = 0, pixel = 0; index < remover.currentMask.length; index += 1, pixel += 4) {
      output.data[pixel + 3] = Math.round(remover.currentMask[index] * 255);
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
    applyTransform();
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
    context.putImageData(overlay, 0, 0);
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
    context.putImageData(overlay, 0, 0);
  }

  function applyTransform() {
    ui.canvas.style.transform = "translate(" + remover.panX + "px," + remover.panY + "px) scale(" + remover.zoom + ")";
    ui.zoomValue.textContent = Math.round(remover.zoom * 100) + " %";
  }

  function fitPreview() {
    remover.zoom = 1;
    remover.panX = 0;
    remover.panY = 0;
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

  function pointerDown(event) {
    if (!remover.sourceImage) return;
    ui.canvas.setPointerCapture(event.pointerId);
    remover.lastClientX = event.clientX;
    remover.lastClientY = event.clientY;
    if (remover.tool === "pan") {
      remover.panning = true;
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
    stroke.points.push(normalizedPoint(event));
    applyStroke(remover.currentMask, stroke, Math.max(0, previousLength - 1));
    renderPreview();
  }

  function pointerUp() {
    remover.drawing = false;
    remover.panning = false;
    remover.activeStroke = null;
  }

  function updateCursor(event) {
    if (remover.tool === "pan" || !remover.currentMask) {
      ui.cursor.classList.add("hidden");
      return;
    }
    var shellRect = ui.shell.getBoundingClientRect();
    var size = Number(ui.brush.value) * remover.zoom;
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
    ui.canvas.classList.toggle("is-brushing", tool !== "pan");
    if (tool === "pan") ui.cursor.classList.add("hidden");
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

  async function buildFinalBlob() {
    if (!remover.resultBlob || !remover.resultImage) throw new Error("Aucun résultat à exporter.");
    if (!remover.actions.length) return remover.resultBlob;

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
    remover.actions.forEach(function (stroke) { paintMaskStroke(maskContext, stroke, width, height); });

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
    remover.baseMask = null;
    remover.currentMask = null;
    remover.actions = [];
    remover.redo = [];
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
      document.querySelectorAll("[data-br-mode]").forEach(function (item) { item.classList.toggle("active", item === button); });
    });
  });
  document.querySelectorAll("[data-br-tool]").forEach(function (button) { button.addEventListener("click", function () { setTool(button.dataset.brTool); }); });
  document.querySelectorAll("[data-br-view]").forEach(function (button) { button.addEventListener("click", function () { setView(button.dataset.brView); }); });
  document.querySelectorAll("[data-br-background]").forEach(function (button) { button.addEventListener("click", function () { setBackground(button.dataset.brBackground); }); });

  ui.previewColor.addEventListener("input", function () {
    remover.background = "custom";
    ui.shell.className = "br-canvas-shell br-bg-custom";
    ui.shell.style.backgroundColor = ui.previewColor.value;
    document.querySelectorAll("[data-br-background]").forEach(function (button) { button.classList.remove("active"); });
  });
  ui.feather.addEventListener("input", function () { ui.featherValue.textContent = Number(ui.feather.value).toFixed(1).replace(".", ",") + " px"; });
  ui.edge.addEventListener("input", function () { ui.edgeValue.textContent = ui.edge.value + " px"; });
  ui.brush.addEventListener("input", function () { ui.brushValue.textContent = ui.brush.value + " px"; });
  ui.hardness.addEventListener("input", function () { ui.hardnessValue.textContent = ui.hardness.value + " %"; });
  ui.opacity.addEventListener("input", function () { ui.opacityValue.textContent = ui.opacity.value + " %"; });
  ui.split.addEventListener("input", function () { ui.splitValue.textContent = ui.split.value + " %"; renderPreview(); });

  ui.analyze.addEventListener("click", analyze);
  ui.cancel.addEventListener("click", function () { if (remover.abortController) remover.abortController.abort(); });
  ui.undo.addEventListener("click", function () { if (remover.actions.length) { remover.redo.push(remover.actions.pop()); rebuildMask(); } });
  ui.redo.addEventListener("click", function () { if (remover.redo.length) { remover.actions.push(remover.redo.pop()); rebuildMask(); } });
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

  window.addEventListener("beforeunload", clearUrls);
  setTool("pan");
  setBackground("checker");
  testApi();
})();
