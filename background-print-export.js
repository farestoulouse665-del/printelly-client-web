"use strict";
(function () {
  function clampNumber(value, minimum, maximum, fallback) {
    var number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(maximum, Math.max(minimum, number));
  }

  function calculate(options) {
    var sourceWidth = Math.max(1, Math.round(Number(options.sourceWidth) || 1));
    var sourceHeight = Math.max(1, Math.round(Number(options.sourceHeight) || 1));
    var unit = options.unit === "in" ? "in" : "cm";
    var widthValue = clampNumber(options.width, 0.1, unit === "cm" ? 500 : 200, 25);
    var widthInches = unit === "cm" ? widthValue / 2.54 : widthValue;
    var naturalHeight = widthValue * sourceHeight / sourceWidth;
    var lockRatio = options.lockRatio !== false;
    var heightValue = lockRatio
      ? naturalHeight
      : clampNumber(options.height, 0.1, unit === "cm" ? 500 : 200, naturalHeight);
    var heightInches = unit === "cm" ? heightValue / 2.54 : heightValue;
    var dpi = Math.round(clampNumber(options.dpi, 36, 1200, 300));
    var effectiveDpiX = sourceWidth / widthInches;
    var effectiveDpiY = sourceHeight / heightInches;
    var effectiveDpi = Math.min(effectiveDpiX, effectiveDpiY);
    var targetWidth = Math.max(1, Math.round(widthInches * dpi));
    var targetHeight = Math.max(1, Math.round(heightInches * dpi));
    var mode = options.mode === "resample" ? "resample" : "metadata";
    var outputWidth = mode === "resample" ? targetWidth : sourceWidth;
    var outputHeight = mode === "resample" ? targetHeight : sourceHeight;
    var scale = targetWidth / sourceWidth;
    var quality = effectiveDpi >= 250 ? "ready" : effectiveDpi >= 150 ? "warning" : "error";
    var message = quality === "ready"
      ? "Résolution originale adaptée à cette taille."
      : quality === "warning"
        ? "Résolution moyenne : vérifiez les petits textes et contours."
        : "Résolution originale insuffisante pour une impression nette.";
    var sourceRatio = sourceWidth / sourceHeight;
    var targetRatio = widthInches / heightInches;
    if (!lockRatio && Math.abs(targetRatio / sourceRatio - 1.0) > 0.01) {
      quality = "error";
      message = "Les proportions sont modifiées; activez le verrouillage pour éviter une déformation.";
    }
    if (mode === "resample" && scale > 1.5) {
      quality = scale > 2.5 ? "error" : "warning";
      message = "Agrandissement ×" + scale.toFixed(2).replace(".", ",") + " : aucun redimensionnement ne peut recréer les détails absents.";
    }
    return {
      unit: unit,
      width: widthValue,
      height: heightValue,
      lockRatio: lockRatio,
      widthInches: widthInches,
      heightInches: heightInches,
      dpi: dpi,
      effectiveDpi: effectiveDpi,
      targetWidth: targetWidth,
      targetHeight: targetHeight,
      outputWidth: outputWidth,
      outputHeight: outputHeight,
      scale: scale,
      mode: mode,
      quality: quality,
      message: message
    };
  }

  function crc32(bytes) {
    var crc = 0xffffffff;
    for (var index = 0; index < bytes.length; index += 1) {
      crc ^= bytes[index];
      for (var bit = 0; bit < 8; bit += 1) {
        crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
      }
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  function writeUint32(target, offset, value) {
    target[offset] = (value >>> 24) & 255;
    target[offset + 1] = (value >>> 16) & 255;
    target[offset + 2] = (value >>> 8) & 255;
    target[offset + 3] = value & 255;
  }

  function chunk(type, data) {
    var result = new Uint8Array(data.length + 12);
    writeUint32(result, 0, data.length);
    for (var index = 0; index < 4; index += 1) result[4 + index] = type.charCodeAt(index);
    result.set(data, 8);
    writeUint32(result, 8 + data.length, crc32(result.subarray(4, 8 + data.length)));
    return result;
  }

  async function embedPngDpi(blob, dpi) {
    var value = Math.round(clampNumber(dpi, 36, 1200, 300));
    var source = new Uint8Array(await blob.arrayBuffer());
    var signature = [137, 80, 78, 71, 13, 10, 26, 10];
    if (source.length < 20 || !signature.every(function (byte, index) { return source[index] === byte; })) {
      throw new Error("Le fichier final n’est pas un PNG valide.");
    }
    var ppm = Math.round(value / 0.0254);
    var physical = new Uint8Array(9);
    writeUint32(physical, 0, ppm);
    writeUint32(physical, 4, ppm);
    physical[8] = 1;
    var physChunk = chunk("pHYs", physical);
    var parts = [source.slice(0, 8)];
    var offset = 8;
    var inserted = false;
    while (offset + 12 <= source.length) {
      var length = (
        source[offset] * 0x1000000
        + source[offset + 1] * 0x10000
        + source[offset + 2] * 0x100
        + source[offset + 3]
      ) >>> 0;
      var end = offset + length + 12;
      if (end > source.length) throw new Error("La structure du PNG final est invalide.");
      var type = String.fromCharCode(
        source[offset + 4],
        source[offset + 5],
        source[offset + 6],
        source[offset + 7]
      );
      if (type !== "pHYs") parts.push(source.slice(offset, end));
      if (type === "IHDR" && !inserted) {
        parts.push(physChunk);
        inserted = true;
      }
      offset = end;
      if (type === "IEND") break;
    }
    if (!inserted) throw new Error("Le PNG final ne contient pas d’en-tête IHDR.");
    return new Blob(parts, { type: "image/png" });
  }

  function outputName(name, dpi) {
    var base = String(name || "image-sans-fond.png").replace(/-\d+dpi(?=\.png$)/i, "").replace(/\.png$/i, "");
    return base + "-" + Math.round(clampNumber(dpi, 36, 1200, 300)) + "dpi.png";
  }

  window.PrintellyPrintExport = {
    calculate: calculate,
    embedPngDpi: embedPngDpi,
    outputName: outputName
  };
})();
