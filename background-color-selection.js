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


  function dominantGuideColor(imageData, width, height, guide) {
    validate(imageData, width, height);
    if (!guide || guide.length !== width * height) {
      throw new Error("La zone dessinée n’a pas les mêmes dimensions que l’image.");
    }
    var buckets = Object.create(null);
    var winner = null;
    for (var index = 0; index < guide.length; index += 1) {
      if (!guide[index]) continue;
      var offset = index * 4;
      var red = imageData.data[offset];
      var green = imageData.data[offset + 1];
      var blue = imageData.data[offset + 2];
      var key = (red >> 4) + ":" + (green >> 4) + ":" + (blue >> 4);
      var bucket = buckets[key];
      if (!bucket) bucket = buckets[key] = { count: 0, red: 0, green: 0, blue: 0 };
      bucket.count += 1;
      bucket.red += red;
      bucket.green += green;
      bucket.blue += blue;
      if (!winner || bucket.count > winner.count) winner = bucket;
    }
    if (!winner) throw new Error("Dessinez une zone avant de lancer la détection.");
    return {
      red: Math.round(winner.red / winner.count),
      green: Math.round(winner.green / winner.count),
      blue: Math.round(winner.blue / winner.count)
    };
  }

  function guidedSelection(imageData, width, height, guide, color, tolerance) {
    validate(imageData, width, height);
    if (!guide || guide.length !== width * height) {
      throw new Error("La zone dessinée n’a pas les mêmes dimensions que l’image.");
    }
    var target = color || dominantGuideColor(imageData, width, height, guide);
    var threshold = thresholdFor(tolerance);
    var selected = new Uint8Array(width * height);
    var count = 0;
    for (var index = 0; index < selected.length; index += 1) {
      if (!guide[index]) continue;
      if (weightedDistance(imageData.data, index * 4, target.red, target.green, target.blue) <= threshold) {
        selected[index] = 1;
        count += 1;
      }
    }
    return { mask: selected, count: count, color: target };
  }


  function colorDistance(a, b) {
    var redMean = (a.red + b.red) / 2;
    var deltaRed = a.red - b.red;
    var deltaGreen = a.green - b.green;
    var deltaBlue = a.blue - b.blue;
    return Math.sqrt(
      (2 + redMean / 256) * deltaRed * deltaRed +
      4 * deltaGreen * deltaGreen +
      (2.5 + (255 - redMean) / 256) * deltaBlue * deltaBlue
    );
  }

  function extractPalette(imageData, width, height, alphaMask, requestedMaxColors) {
    validate(imageData, width, height);
    if (alphaMask && alphaMask.length !== width * height) {
      throw new Error("Le masque alpha et l’image n’ont pas les mêmes dimensions.");
    }
    var maxColors = Math.max(2, Math.min(12, Number(requestedMaxColors) || 8));
    var buckets = Object.create(null);
    var visibleCount = 0;
    for (var index = 0; index < width * height; index += 1) {
      if (alphaMask && alphaMask[index] <= 0.05) continue;
      var offset = index * 4;
      var red = imageData.data[offset];
      var green = imageData.data[offset + 1];
      var blue = imageData.data[offset + 2];
      var key = (red >> 5) + ":" + (green >> 5) + ":" + (blue >> 5);
      var bucket = buckets[key];
      if (!bucket) bucket = buckets[key] = { count: 0, red: 0, green: 0, blue: 0 };
      bucket.count += 1;
      bucket.red += red;
      bucket.green += green;
      bucket.blue += blue;
      visibleCount += 1;
    }
    if (!visibleCount) return { colors: [], assignments: new Int32Array(width * height).fill(-1), visibleCount: 0 };

    var ordered = Object.keys(buckets).map(function (key) {
      var bucket = buckets[key];
      return {
        count: bucket.count,
        red: bucket.red / bucket.count,
        green: bucket.green / bucket.count,
        blue: bucket.blue / bucket.count
      };
    }).sort(function (a, b) { return b.count - a.count; });

    var clusters = [];
    ordered.forEach(function (bucket) {
      var nearest = -1;
      var nearestDistance = Infinity;
      for (var clusterIndex = 0; clusterIndex < clusters.length; clusterIndex += 1) {
        var distance = colorDistance(bucket, clusters[clusterIndex]);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearest = clusterIndex;
        }
      }
      if (nearest < 0 || (clusters.length < maxColors && nearestDistance > 72)) {
        clusters.push({
          count: bucket.count,
          red: bucket.red,
          green: bucket.green,
          blue: bucket.blue
        });
        return;
      }
      var cluster = clusters[nearest];
      var total = cluster.count + bucket.count;
      cluster.red = (cluster.red * cluster.count + bucket.red * bucket.count) / total;
      cluster.green = (cluster.green * cluster.count + bucket.green * bucket.count) / total;
      cluster.blue = (cluster.blue * cluster.count + bucket.blue * bucket.count) / total;
      cluster.count = total;
    });

    clusters.sort(function (a, b) { return b.count - a.count; });
    var assignments = new Int32Array(width * height);
    assignments.fill(-1);
    var counts = new Int32Array(clusters.length);
    for (var pixel = 0; pixel < width * height; pixel += 1) {
      if (alphaMask && alphaMask[pixel] <= 0.05) continue;
      var pixelOffset = pixel * 4;
      var color = {
        red: imageData.data[pixelOffset],
        green: imageData.data[pixelOffset + 1],
        blue: imageData.data[pixelOffset + 2]
      };
      var bestIndex = 0;
      var bestDistance = Infinity;
      for (var candidate = 0; candidate < clusters.length; candidate += 1) {
        var candidateDistance = colorDistance(color, clusters[candidate]);
        if (candidateDistance < bestDistance) {
          bestDistance = candidateDistance;
          bestIndex = candidate;
        }
      }
      assignments[pixel] = bestIndex;
      counts[bestIndex] += 1;
    }

    var colors = clusters.map(function (cluster, index) {
      return {
        red: Math.round(cluster.red),
        green: Math.round(cluster.green),
        blue: Math.round(cluster.blue),
        count: counts[index],
        ratio: counts[index] / visibleCount
      };
    }).filter(function (color) { return color.count > 0; });
    return { colors: colors, assignments: assignments, visibleCount: visibleCount };
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
    dominantGuideColor: dominantGuideColor,
    guidedSelection: guidedSelection,
    extractPalette: extractPalette,
    eraseMask: eraseMask
  };
})();
