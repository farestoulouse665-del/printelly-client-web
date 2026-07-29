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

  function connectedRegion(imageData, width, height, seedX, seedY, tolerance) {
    if (!imageData || !imageData.data || width < 1 || height < 1) {
      throw new Error("Image de sélection invalide.");
    }
    var x = Math.max(0, Math.min(width - 1, Math.round(seedX)));
    var y = Math.max(0, Math.min(height - 1, Math.round(seedY)));
    var seedIndex = y * width + x;
    var seedOffset = seedIndex * 4;
    var red = imageData.data[seedOffset];
    var green = imageData.data[seedOffset + 1];
    var blue = imageData.data[seedOffset + 2];
    var threshold = 5 + Math.max(0, Math.min(100, Number(tolerance) || 0)) * 3;
    var selected = new Uint8Array(width * height);
    var visited = new Uint8Array(width * height);
    var queue = new Int32Array(width * height);
    var head = 0;
    var tail = 0;
    var count = 0;
    queue[tail++] = seedIndex;
    visited[seedIndex] = 1;

    while (head < tail) {
      var index = queue[head++];
      if (weightedDistance(imageData.data, index * 4, red, green, blue) > threshold) continue;
      selected[index] = 1;
      count += 1;
      var currentX = index % width;
      var currentY = Math.floor(index / width);
      var neighbour;
      if (currentX > 0) {
        neighbour = index - 1;
        if (!visited[neighbour]) { visited[neighbour] = 1; queue[tail++] = neighbour; }
      }
      if (currentX + 1 < width) {
        neighbour = index + 1;
        if (!visited[neighbour]) { visited[neighbour] = 1; queue[tail++] = neighbour; }
      }
      if (currentY > 0) {
        neighbour = index - width;
        if (!visited[neighbour]) { visited[neighbour] = 1; queue[tail++] = neighbour; }
      }
      if (currentY + 1 < height) {
        neighbour = index + width;
        if (!visited[neighbour]) { visited[neighbour] = 1; queue[tail++] = neighbour; }
      }
    }

    return {
      mask: selected,
      count: count,
      color: { red: red, green: green, blue: blue }
    };
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
    connectedRegion: connectedRegion,
    eraseMask: eraseMask
  };
})();
