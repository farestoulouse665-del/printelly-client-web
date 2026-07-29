"use strict";
(function () {
  function validate(imageData, alphaMask, width, height) {
    if (!imageData || !imageData.data || imageData.data.length < width * height * 4) {
      throw new Error("Image invalide pour le contrôle qualité.");
    }
    if (!alphaMask || alphaMask.length !== width * height) {
      throw new Error("Masque alpha invalide pour le contrôle qualité.");
    }
  }

  function bboxFrom(minX, minY, maxX, maxY, width, height) {
    return {
      x: minX / width,
      y: minY / height,
      width: Math.max(1, maxX - minX + 1) / width,
      height: Math.max(1, maxY - minY + 1) / height
    };
  }

  function inspect(imageData, alphaMask, width, height, options) {
    validate(imageData, alphaMask, width, height);
    options = options || {};
    var total = width * height;
    var foreground = 0;
    var transparent = 0;
    var semiTransparent = 0;
    var lowAlphaResidue = 0;
    var edgePixels = 0;
    var lightEdgePixels = 0;
    var darkEdgePixels = 0;
    var touchesBorder = 0;

    for (var index = 0; index < total; index += 1) {
      var alpha = alphaMask[index];
      if (alpha <= 0.01) transparent += 1;
      else {
        foreground += 1;
        if (alpha < 0.95) semiTransparent += 1;
        if (alpha < 0.18) lowAlphaResidue += 1;
      }
      var x = index % width;
      var y = Math.floor(index / width);
      if (alpha > 0.05 && (x === 0 || y === 0 || x === width - 1 || y === height - 1)) touchesBorder += 1;
      if (alpha <= 0.05) continue;
      var boundary = (x > 0 && alphaMask[index - 1] <= 0.02) ||
        (x + 1 < width && alphaMask[index + 1] <= 0.02) ||
        (y > 0 && alphaMask[index - width] <= 0.02) ||
        (y + 1 < height && alphaMask[index + width] <= 0.02);
      if (!boundary) continue;
      edgePixels += 1;
      var offset = index * 4;
      var luminance = imageData.data[offset] * 0.2126 + imageData.data[offset + 1] * 0.7152 + imageData.data[offset + 2] * 0.0722;
      if (luminance >= 245) lightEdgePixels += 1;
      if (luminance <= 10) darkEdgePixels += 1;
    }

    var visited = new Uint8Array(total);
    var queue = new Int32Array(total);
    var microMask = new Uint8Array(total);
    var microCount = 0;
    var microComponents = [];
    var componentLimit = Math.max(2, Math.min(64, Number(options.microPixelLimit) || 12));

    for (var seed = 0; seed < total; seed += 1) {
      if (visited[seed] || alphaMask[seed] <= 0.1) continue;
      var head = 0;
      var tail = 0;
      var component = [];
      var minX = width;
      var minY = height;
      var maxX = 0;
      var maxY = 0;
      visited[seed] = 1;
      queue[tail++] = seed;
      while (head < tail) {
        var current = queue[head++];
        component.push(current);
        var currentX = current % width;
        var currentY = Math.floor(current / width);
        minX = Math.min(minX, currentX);
        minY = Math.min(minY, currentY);
        maxX = Math.max(maxX, currentX);
        maxY = Math.max(maxY, currentY);
        var neighbour;
        if (currentX > 0) {
          neighbour = current - 1;
          if (!visited[neighbour] && alphaMask[neighbour] > 0.1) { visited[neighbour] = 1; queue[tail++] = neighbour; }
        }
        if (currentX + 1 < width) {
          neighbour = current + 1;
          if (!visited[neighbour] && alphaMask[neighbour] > 0.1) { visited[neighbour] = 1; queue[tail++] = neighbour; }
        }
        if (currentY > 0) {
          neighbour = current - width;
          if (!visited[neighbour] && alphaMask[neighbour] > 0.1) { visited[neighbour] = 1; queue[tail++] = neighbour; }
        }
        if (currentY + 1 < height) {
          neighbour = current + width;
          if (!visited[neighbour] && alphaMask[neighbour] > 0.1) { visited[neighbour] = 1; queue[tail++] = neighbour; }
        }
      }
      if (component.length <= componentLimit) {
        component.forEach(function (pixel) { microMask[pixel] = 1; });
        microCount += component.length;
        if (microComponents.length < 20) {
          microComponents.push({
            pixels: component.length,
            bbox: bboxFrom(minX, minY, maxX, maxY, width, height)
          });
        }
      }
    }

    var holeVisited = new Uint8Array(total);
    var holes = [];
    var maximumHole = Math.max(8, Math.floor(total * 0.002));
    for (var holeSeed = 0; holeSeed < total; holeSeed += 1) {
      if (holeVisited[holeSeed] || alphaMask[holeSeed] >= 0.05) continue;
      var holeHead = 0;
      var holeTail = 0;
      var holeSize = 0;
      var holeMinX = width;
      var holeMinY = height;
      var holeMaxX = 0;
      var holeMaxY = 0;
      var touchesImageBorder = false;
      holeVisited[holeSeed] = 1;
      queue[holeTail++] = holeSeed;
      while (holeHead < holeTail) {
        var holePixel = queue[holeHead++];
        holeSize += 1;
        var holeX = holePixel % width;
        var holeY = Math.floor(holePixel / width);
        holeMinX = Math.min(holeMinX, holeX);
        holeMinY = Math.min(holeMinY, holeY);
        holeMaxX = Math.max(holeMaxX, holeX);
        holeMaxY = Math.max(holeMaxY, holeY);
        if (holeX === 0 || holeY === 0 || holeX === width - 1 || holeY === height - 1) touchesImageBorder = true;
        var holeNeighbour;
        if (holeX > 0) {
          holeNeighbour = holePixel - 1;
          if (!holeVisited[holeNeighbour] && alphaMask[holeNeighbour] < 0.05) { holeVisited[holeNeighbour] = 1; queue[holeTail++] = holeNeighbour; }
        }
        if (holeX + 1 < width) {
          holeNeighbour = holePixel + 1;
          if (!holeVisited[holeNeighbour] && alphaMask[holeNeighbour] < 0.05) { holeVisited[holeNeighbour] = 1; queue[holeTail++] = holeNeighbour; }
        }
        if (holeY > 0) {
          holeNeighbour = holePixel - width;
          if (!holeVisited[holeNeighbour] && alphaMask[holeNeighbour] < 0.05) { holeVisited[holeNeighbour] = 1; queue[holeTail++] = holeNeighbour; }
        }
        if (holeY + 1 < height) {
          holeNeighbour = holePixel + width;
          if (!holeVisited[holeNeighbour] && alphaMask[holeNeighbour] < 0.05) { holeVisited[holeNeighbour] = 1; queue[holeTail++] = holeNeighbour; }
        }
      }
      if (!touchesImageBorder && holeSize >= 2 && holeSize <= maximumHole && holes.length < 20) {
        holes.push({ pixels: holeSize, bbox: bboxFrom(holeMinX, holeMinY, holeMaxX, holeMaxY, width, height) });
      }
    }

    var printWidthCm = Math.max(0, Number(options.printWidthCm) || 0);
    var dpi = printWidthCm ? width / (printWidthCm / 2.54) : 0;
    var issues = [];
    if (!foreground) issues.push({ type: "empty", severity: "error", title: "Sujet vide", message: "Aucun pixel visible n’est présent dans le masque." });
    if (!transparent) issues.push({ type: "opaque", severity: "error", title: "Aucune transparence", message: "Le résultat ne contient aucun fond transparent." });
    if (microCount) issues.push({ type: "micro", severity: microCount > 100 ? "error" : "warning", title: "Micro-pixels isolés", message: microCount + " pixel(s) réparti(s) dans de très petits fragments.", bbox: microComponents[0] ? microComponents[0].bbox : null });
    if (holes.length) issues.push({ type: "holes", severity: "warning", title: "Trous intérieurs à vérifier", message: holes.length + " petite(s) ouverture(s) détectée(s). Certaines peuvent être volontaires.", bbox: holes[0].bbox });
    if (lowAlphaResidue > Math.max(20, foreground * 0.01)) issues.push({ type: "residue", severity: "warning", title: "Voile transparent résiduel", message: lowAlphaResidue + " pixel(s) presque transparents peuvent provenir de l’ancien fond." });
    if (edgePixels && lightEdgePixels / edgePixels > 0.35) issues.push({ type: "light-halo", severity: "warning", title: "Contour clair à vérifier", message: "Une proportion importante des bords est très claire. Vérifiez le résultat sur un fond noir." });
    if (edgePixels && darkEdgePixels / edgePixels > 0.35) issues.push({ type: "dark-halo", severity: "warning", title: "Contour sombre à vérifier", message: "Une proportion importante des bords est très sombre. Vérifiez le résultat sur un fond blanc." });
    if (touchesBorder > Math.max(4, (width + height) * 0.04)) issues.push({ type: "clipped", severity: "warning", title: "Sujet proche des bords", message: "Le sujet touche fortement le cadre et peut être partiellement coupé." });
    if (dpi && dpi < 150) issues.push({ type: "dpi", severity: "error", title: "Résolution insuffisante", message: Math.round(dpi) + " DPI seulement à la taille choisie." });
    else if (dpi && dpi < 250) issues.push({ type: "dpi", severity: "warning", title: "Résolution moyenne", message: Math.round(dpi) + " DPI à la taille choisie. Une taille plus petite améliorera la précision." });

    var score = 100;
    issues.forEach(function (issue) { score -= issue.severity === "error" ? 18 : 7; });
    score = Math.max(0, Math.min(100, score));
    return {
      score: score,
      status: score >= 90 ? "excellent" : score >= 75 ? "good" : score >= 55 ? "check" : "poor",
      issues: issues,
      microMask: microMask,
      microCount: microCount,
      holes: holes,
      dpi: dpi,
      foregroundRatio: foreground / total,
      transparentRatio: transparent / total,
      semiTransparentRatio: semiTransparent / total,
      lowAlphaResidue: lowAlphaResidue,
      edgePixels: edgePixels
    };
  }

  window.PrintellyQualityInspector = { inspect: inspect };
})();
