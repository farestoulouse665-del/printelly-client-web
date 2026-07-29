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

  function forEachNeighbour(index, width, height, callback) {
    var x = index % width;
    var y = Math.floor(index / width);
    for (var deltaY = -1; deltaY <= 1; deltaY += 1) {
      for (var deltaX = -1; deltaX <= 1; deltaX += 1) {
        if (!deltaX && !deltaY) continue;
        var nextX = x + deltaX;
        var nextY = y + deltaY;
        if (nextX >= 0 && nextX < width && nextY >= 0 && nextY < height) {
          callback(nextY * width + nextX);
        }
      }
    }
  }

  function dominantBorderColor(imageData, width, height) {
    validate(imageData, width, height);
    var buckets = Object.create(null);
    var winner = null;
    function sample(index) {
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
    for (var x = 0; x < width; x += 1) {
      sample(x);
      if (height > 1) sample((height - 1) * width + x);
    }
    for (var y = 1; y + 1 < height; y += 1) {
      sample(y * width);
      if (width > 1) sample(y * width + width - 1);
    }
    return {
      red: Math.round(winner.red / winner.count),
      green: Math.round(winner.green / winner.count),
      blue: Math.round(winner.blue / winner.count)
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
      forEachNeighbour(index, width, height, function (neighbour) {
        if (matches[neighbour] && !selected[neighbour]) {
          selected[neighbour] = 1;
          queue[tail++] = neighbour;
        }
      });
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
      forEachNeighbour(index, width, height, seed);
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


  function guidedRegion(imageData, width, height, guide, color, tolerance) {
    validate(imageData, width, height);
    if (!guide || guide.length !== width * height) {
      throw new Error("La zone dessinée n’a pas les mêmes dimensions que l’image.");
    }
    var target = color || dominantGuideColor(imageData, width, height, guide);
    var threshold = thresholdFor(tolerance);
    var total = width * height;
    var matches = new Uint8Array(total);
    var allowed = new Uint8Array(total);
    var selected = new Uint8Array(total);
    var queue = new Int32Array(total);
    var distance = new Int32Array(total);
    distance.fill(-1);
    var head = 0;
    var tail = 0;
    var expansion = Math.max(4, Math.min(24, Math.round(Math.min(width, height) * 0.015)));

    for (var index = 0; index < total; index += 1) {
      matches[index] = weightedDistance(
        imageData.data,
        index * 4,
        target.red,
        target.green,
        target.blue
      ) <= threshold ? 1 : 0;
      if (guide[index]) {
        allowed[index] = 1;
        distance[index] = 0;
        queue[tail++] = index;
      }
    }
    if (!tail) throw new Error("Dessinez une zone avant de lancer la détection.");

    while (head < tail) {
      var current = queue[head++];
      if (distance[current] >= expansion) continue;
      forEachNeighbour(current, width, height, function (neighbour) {
        if (distance[neighbour] >= 0) return;
        distance[neighbour] = distance[current] + 1;
        allowed[neighbour] = 1;
        queue[tail++] = neighbour;
      });
    }

    head = 0;
    tail = 0;
    for (var seed = 0; seed < total; seed += 1) {
      if (guide[seed] && matches[seed] && !selected[seed]) {
        selected[seed] = 1;
        queue[tail++] = seed;
      }
    }
    while (head < tail) {
      var pixel = queue[head++];
      forEachNeighbour(pixel, width, height, function (neighbour) {
        if (allowed[neighbour] && matches[neighbour] && !selected[neighbour]) {
          selected[neighbour] = 1;
          queue[tail++] = neighbour;
        }
      });
    }
    return { mask: selected, count: tail, color: target, expansion: expansion };
  }

  function scanResidualBackground(imageData, alphaMask, width, height, tolerance) {
    validate(imageData, width, height);
    if (!alphaMask || alphaMask.length !== width * height) {
      throw new Error("Le masque alpha et l’image n’ont pas les mêmes dimensions.");
    }
    var total = width * height;
    var background = dominantBorderColor(imageData, width, height);
    var threshold = thresholdFor(tolerance == null ? 10 : tolerance) * 1.15;
    var similar = new Uint8Array(total);
    var candidate = new Uint8Array(total);
    var selected = new Uint8Array(total);
    var queue = new Int32Array(total);
    var lowAlphaCount = 0;
    var borderCount = 0;
    var fragmentCount = 0;

    for (var index = 0; index < total; index += 1) {
      similar[index] = weightedDistance(
        imageData.data,
        index * 4,
        background.red,
        background.green,
        background.blue
      ) <= threshold ? 1 : 0;
      var alpha = alphaMask[index];
      if (similar[index] && alpha > 0.01 && alpha < 0.38) {
        selected[index] = 1;
        lowAlphaCount += 1;
      }
      if (similar[index] && alpha > 0.01 && alpha < 0.92) candidate[index] = 1;
    }

    var head = 0;
    var tail = 0;
    function seedBorder(index) {
      if (candidate[index] && !selected[index]) {
        selected[index] = 1;
        queue[tail++] = index;
      }
    }
    for (var x = 0; x < width; x += 1) {
      seedBorder(x);
      seedBorder((height - 1) * width + x);
    }
    for (var y = 0; y < height; y += 1) {
      seedBorder(y * width);
      seedBorder(y * width + width - 1);
    }
    while (head < tail) {
      var current = queue[head++];
      borderCount += 1;
      forEachNeighbour(current, width, height, function (neighbour) {
        if (candidate[neighbour] && !selected[neighbour]) {
          selected[neighbour] = 1;
          queue[tail++] = neighbour;
        }
      });
    }

    var visited = new Uint8Array(total);
    var componentLimit = Math.max(12, Math.min(512, Math.round(total * 0.0005)));
    for (var componentSeed = 0; componentSeed < total; componentSeed += 1) {
      if (visited[componentSeed] || alphaMask[componentSeed] <= 0.05) continue;
      head = 0;
      tail = 0;
      var component = [];
      var similarCount = 0;
      visited[componentSeed] = 1;
      queue[tail++] = componentSeed;
      while (head < tail) {
        var componentPixel = queue[head++];
        component.push(componentPixel);
        if (similar[componentPixel]) similarCount += 1;
        if (component.length > componentLimit) break;
        forEachNeighbour(componentPixel, width, height, function (neighbour) {
          if (!visited[neighbour] && alphaMask[neighbour] > 0.05) {
            visited[neighbour] = 1;
            queue[tail++] = neighbour;
          }
        });
      }
      if (component.length <= componentLimit && similarCount / component.length >= 0.75) {
        component.forEach(function (pixelIndex) {
          if (!selected[pixelIndex]) {
            selected[pixelIndex] = 1;
            fragmentCount += 1;
          }
        });
      }
    }

    var count = 0;
    for (var resultIndex = 0; resultIndex < total; resultIndex += 1) {
      if (selected[resultIndex]) count += 1;
    }
    return {
      mask: selected,
      count: count,
      color: background,
      lowAlphaCount: lowAlphaCount,
      borderCount: borderCount,
      fragmentCount: fragmentCount
    };
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
    guidedRegion: guidedRegion,
    dominantBorderColor: dominantBorderColor,
    scanResidualBackground: scanResidualBackground,
    extractPalette: extractPalette,
    eraseMask: eraseMask
  };
})();
