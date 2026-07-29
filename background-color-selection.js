"use strict";
(function () {
  function weightedDistance(data, pixelOffset, red, green, blue) {
    var currentRed = data[pixelOffset];
    var currentGreen = data[pixelOffset + 1];
    var currentBlue = data[pixelOffset + 2];
    var redMean = (currentRed + red) / 2;
    var deltaRed = currentRed - red;
    var deltaGreen = currentGreen - green;
    var deltaBlue = currentBlue - blue;
    return Math.sqrt(
      (2 + redMean / 256) * deltaRed * deltaRed +
      4 * deltaGreen * deltaGreen +
      (2.5 + (255 - redMean) / 256) * deltaBlue * deltaBlue
    );
  }

  function validate(imageData, width, height) {
    if (!imageData || !imageData.data || width < 1 || height < 1 || imageData.data.length < width * height * 4) {
      throw new Error("Image de sélection invalide.");
    }
  }

  function thresholdFor(tolerance) {
    return 5 + Math.max(0, Math.min(100, Number(tolerance) || 0)) * 5;
  }

  function colorAt(imageData, width, height, seedX, seedY) {
    validate(imageData, width, height);
    var x = Math.max(0, Math.min(width - 1, Math.round(seedX)));
    var y = Math.max(0, Math.min(height - 1, Math.round(seedY)));
    var index = y * width + x;
    var offset = index * 4;
    return {
      x: x,
      y: y,
      index: index,
      red: imageData.data[offset],
      green: imageData.data[offset + 1],
      blue: imageData.data[offset + 2]
    };
  }

  function matchingColor(imageData, width, height, color, tolerance) {
    validate(imageData, width, height);
    var threshold = thresholdFor(tolerance);
    var selected = new Uint8Array(width * height);
    var count = 0;
    for (var index = 0; index < selected.length; index += 1) {
      if (weightedDistance(imageData.data, index * 4, color.red, color.green, color.blue) <= threshold) {
        selected[index] = 1;
        count += 1;
      }
    }
    return { mask: selected, count: count, color: color };
  }

  function connectedRegion(imageData, width, height, seedX, seedY, tolerance) {
    var color = colorAt(imageData, width, height, seedX, seedY);
    var matches = matchingColor(imageData, width, height, color, tolerance).mask;
    var selected = new Uint8Array(width * height);
    var queue = new Int32Array(width * height);
    var head = 0;
    var tail = 0;
    var count = 0;
    queue[tail++] = color.index;
    selected[color.index] = 1;

    while (head < tail) {
      var index = queue[head++];
      if (!matches[index]) continue;
      var currentX = index % width;
      var currentY = Math.floor(index / width);
      var neighbour;
      if (currentX > 0) {
        neighbour = index - 1;
        if (matches[neighbour] && !selected[neighbour]) { selected[neighbour] = 1; queue[tail++] = neighbour; }
      }
      if (currentX + 1 < width) {
        neighbour = index + 1;
        if (matches[neighbour] && !selected[neighbour]) { selected[neighbour] = 1; queue[tail++] = neighbour; }
      }
      if (currentY > 0) {
        neighbour = index - width;
        if (matches[neighbour] && !selected[neighbour]) { selected[neighbour] = 1; queue[tail++] = neighbour; }
      }
      if (currentY + 1 < height) {
        neighbour = index + width;
        if (matches[neighbour] && !selected[neighbour]) { selected[neighbour] = 1; queue[tail++] = neighbour; }
      }
    }
    for (var pixel = 0; pixel < selected.length; pixel += 1) if (selected[pixel] && matches[pixel]) count += 1;
    return { mask: selected, count: count, color: color };
  }

  function exteriorColor(imageData, width, height, color, tolerance) {
    var matches = matchingColor(imageData, width, height, color, tolerance).mask;
    var selected = new Uint8Array(width * height);
    var queue = new Int32Array(width * height);
    var head = 0;
    var tail = 0;
    function seed(index) {
      if (matches[index] && !selected[index]) { selected[index] = 1; queue[tail++] = index; }
    }
    for (var x = 0; x < width; x += 1) { seed(x); seed((height - 1) * width + x); }
    for (var y = 0; y < height; y += 1) { seed(y * width); seed(y * width + width - 1); }

    while (head < tail) {
      var index = queue[head++];
      var currentX = index % width;
      var currentY = Math.floor(index / width);
      if (currentX > 0) seed(index - 1);
      if (currentX + 1 < width) seed(index + 1);
      if (currentY > 0) seed(index - width);
      if (currentY + 1 < height) seed(index + width);
    }
    return { mask: selected, count: tail, color: color };
  }

  function eraseMask(alphaMask, selection) {
    if (!alphaMask || !selection || alphaMask.length !== selection.length) {
      throw new Error("Le masque et la sélection n’ont pas les mêmes dimensions.");
    }
    for (var index = 0; index < selection.length; index += 1) {
      if (selection[index]) alphaMask[index] = 0;
    }
  }

  window.PrintellyColorSelection = {
    colorAt: colorAt,
    matchingColor: matchingColor,
    connectedRegion: connectedRegion,
    exteriorColor: exteriorColor,
    eraseMask: eraseMask
  };
})();
