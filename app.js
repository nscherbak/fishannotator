(function () {
  "use strict";

  // Feature ids and canonical order match FishInspector __SHAPES.json output.
  // Every feature is a traced outline ("fineContour"); there are no point
  // features. The pen always draws polylines regardless of "mode".
  var features = [
    { id: "contour_net", label: "Body contour", color: "#00a6d6", visible: true },
    { id: "eye_net", label: "Eye", color: "#f05a28", visible: true },
    { id: "notochord_net", label: "Notochord", color: "#1b9e77", visible: true },
    { id: "pericard_net", label: "Pericard", color: "#d95f02", visible: true },
    { id: "mouth_tip_net", label: "Mouth tip", color: "#7b3fdb", visible: true },
    { id: "otolith2_net", label: "Otolith", color: "#e6ab02", visible: true },
    { id: "placode_net", label: "Placode", color: "#a6761d", visible: true },
    { id: "swimbladder_net", label: "Swim bladder", color: "#3a86a8", visible: true },
    { id: "yolk_net", label: "Yolk sac", color: "#e7298a", visible: true }
  ];

  var featureParameters = {
    contour_net: { disksize_CloseOpen: 0, min_peak_width: 6, contour_smoothing: 0.9 },
    eye_net: { disksize_CloseOpen: 0, min_peak_width: 5, contour_smoothing: 0.9 },
    notochord_net: { disksize_CloseOpen: 0, min_peak_width: 0, contour_smoothing: 0.9 },
    pericard_net: { disksize_CloseOpen: 0, min_peak_width: 4, contour_smoothing: 0.9 },
    mouth_tip_net: { disksize_CloseOpen: 0, min_peak_width: 0, contour_smoothing: 0.9 },
    otolith2_net: { disksize_CloseOpen: 0, min_peak_width: 6, contour_smoothing: 0.9 },
    placode_net: { disksize_CloseOpen: 0, min_peak_width: 7, contour_smoothing: 0.9 },
    swimbladder_net: { disksize_CloseOpen: 0, min_peak_width: 5, contour_smoothing: 0.9 },
    yolk_net: { disksize_CloseOpen: 0, min_peak_width: 6, contour_smoothing: 0.9 }
  };

  var supportedExtensions = ["jpg", "jpeg", "png", "bmp", "gif", "webp", "tif", "tiff"];
  var browserSupportedExtensions = ["jpg", "jpeg", "png", "bmp", "gif", "webp"];
  var DECODE_CACHE_MAX = 4;   // decoded images kept in memory at once

  var canvas = document.getElementById("canvas");
  var ctx = canvas.getContext("2d");
  var imageInput = document.getElementById("imageInput");
  var folderInput = document.getElementById("folderInput");
  var loadImagesBtn = document.getElementById("loadImagesBtn");
  var loadFolderBtn = document.getElementById("loadFolderBtn");
  var dropZone = document.getElementById("dropZone");
  var imageList = document.getElementById("imageList");
  var featureList = document.getElementById("featureList");
  var allFeaturesBtn = document.getElementById("allFeaturesBtn");
  var reviewBadge = document.getElementById("reviewBadge");
  var unsavedBadge = document.getElementById("unsavedBadge");
  var emptyState = document.getElementById("emptyState");
  var imageName = document.getElementById("imageName");
  var zoomLevel = document.getElementById("zoomLevel");
  var cursorCoord = document.getElementById("cursorCoord");
  var activeFeatureName = document.getElementById("activeFeatureName");
  var loadStatus = document.getElementById("loadStatus");
  var loadDetails = document.getElementById("loadDetails");
  var activeImageName = document.getElementById("activeImageName");
  var activeImageSize = document.getElementById("activeImageSize");
  var saveStatus = document.getElementById("saveStatus");
  var exportBtn = document.getElementById("exportBtn");
  var editSize = document.getElementById("editSize");
  var brightnessInput = document.getElementById("brightness");
  var contrastInput = document.getElementById("contrast");
  var viewReset = document.getElementById("viewReset");
  var joinEndsBtn = document.getElementById("joinEndsBtn");
  var flipBtn = document.getElementById("flipBtn");
  var undoBtn = document.getElementById("undoBtn");
  var clearFeatureBtn = document.getElementById("clearFeatureBtn");
  var fitBtn = document.getElementById("fitBtn");
  var zoomInBtn = document.getElementById("zoomInBtn");
  var zoomOutBtn = document.getElementById("zoomOutBtn");
  var zoom100Btn = document.getElementById("zoom100Btn");
  var sidebarToggle = document.getElementById("sidebarToggle");
  var appShell = document.getElementById("appShell");

  var state = {
    images: [],
    activeImageId: null,
    activeFeatureId: features[0].id,
    showAll: false,
    tool: "draw",
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    currentStroke: null,
    editFraction: 0.08,    // push/erase brush diameter as fraction of image height
    brightness: 100,       // view-only image adjustments (percent)
    contrast: 100,
    history: [],
    cursor: null,
    pointers: new Map(),   // pointerId -> { x, y, type }
    action: null,          // { pointerId, kind:'pen'|'mouse', type:'draw'|'erase'|'pan', lastX, lastY }
    touchPan: null,        // { pointerId, lastX, lastY }
    pinch: null,           // { idA, idB, prevDist, prevMidX, prevMidY }
    decodeOrder: []        // ids of decoded images, most-recent last (LRU)
  };

  // ---- small helpers -------------------------------------------------------

  function activeImage() {
    return state.images.find(function (item) { return item.id === state.activeImageId; }) || null;
  }
  function activeFeature() {
    return features.find(function (item) { return item.id === state.activeFeatureId; }) || features[0];
  }
  function featureById(id) {
    return features.find(function (item) { return item.id === id; }) || null;
  }
  function fileExtension(file) {
    var name = file.name || "";
    var dot = name.lastIndexOf(".");
    return dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
  }
  function isImageCandidate(file) {
    var extension = fileExtension(file);
    return (file.type && file.type.indexOf("image/") === 0) || supportedExtensions.indexOf(extension) >= 0;
  }
  function isTiffFile(file) {
    var extension = fileExtension(file);
    var type = (file.type || "").toLowerCase();
    return extension === "tif" || extension === "tiff" || type === "image/tiff" || type === "image/tif";
  }
  function canBrowserDisplay(file) {
    var extension = fileExtension(file);
    return !isTiffFile(file) && (browserSupportedExtensions.indexOf(extension) >= 0 || (file.type && file.type.indexOf("image/") === 0));
  }
  function setLoadStatus(message, isError) {
    loadStatus.textContent = message;
    loadStatus.classList.toggle("error", Boolean(isError));
  }
  function setLoadDetails(lines) {
    var text = (lines || []).filter(Boolean).join("\n");
    loadDetails.textContent = text;
    loadDetails.classList.toggle("visible", Boolean(text));
  }
  function setSaveStatus(message, kind) {
    if (!saveStatus) return;
    saveStatus.textContent = message;
    saveStatus.className = "save-status" + (kind ? " " + kind : "");
  }
  function waitForNextFrame() {
    return new Promise(function (resolve) { requestAnimationFrame(function () { resolve(); }); });
  }
  function distance(a, b) {
    var dx = a.x - b.x, dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }
  function clampScale(s) { return Math.min(12, Math.max(0.02, s)); }

  // ---- canvas / view -------------------------------------------------------

  function resizeCanvas() {
    var rect = canvas.parentElement.getBoundingClientRect();
    var ratio = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(rect.width * ratio));
    canvas.height = Math.max(1, Math.floor(rect.height * ratio));
    canvas.style.width = rect.width + "px";
    canvas.style.height = rect.height + "px";
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    draw();
  }

  function fitImage() {
    var item = activeImage();
    var rect = canvas.getBoundingClientRect();
    if (!item || !item.width || !rect.width || !rect.height) return;
    var margin = 48;
    var scaleX = (rect.width - margin) / item.width;
    var scaleY = (rect.height - margin) / item.height;
    state.scale = clampScale(Math.min(scaleX, scaleY));
    state.offsetX = (rect.width - item.width * state.scale) / 2;
    state.offsetY = (rect.height - item.height * state.scale) / 2;
    draw();
  }

  function screenToImage(clientX, clientY) {
    var rect = canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left - state.offsetX) / state.scale,
      y: (clientY - rect.top - state.offsetY) / state.scale
    };
  }
  function imageToScreen(point) {
    return { x: point.x * state.scale + state.offsetX, y: point.y * state.scale + state.offsetY };
  }
  // Keep annotations on the image: clamp a point to the image rectangle, and
  // test whether a point is within the image (with a small tolerance).
  function clampToImage(p) {
    var it = activeImage();
    if (!it || !it.width) return p;
    return { x: Math.min(it.width, Math.max(0, p.x)), y: Math.min(it.height, Math.max(0, p.y)) };
  }
  function pointInImage(p, tolImg) {
    var it = activeImage();
    if (!it || !it.width) return false;
    var t = tolImg || 0;
    return p.x >= -t && p.y >= -t && p.x <= it.width + t && p.y <= it.height + t;
  }
  function zoomAbout(factor, clientX, clientY) {
    var rect = canvas.getBoundingClientRect();
    var before = screenToImage(clientX, clientY);
    state.scale = clampScale(state.scale * factor);
    state.offsetX = clientX - rect.left - before.x * state.scale;
    state.offsetY = clientY - rect.top - before.y * state.scale;
    draw();
  }
  function zoomCanvasCenter(factor) {
    var rect = canvas.getBoundingClientRect();
    zoomAbout(factor, rect.left + rect.width / 2, rect.top + rect.height / 2);
  }
  function zoomToActual() {
    var item = activeImage();
    if (!item || !item.width) return;
    zoomCanvasCenter(1 / state.scale);
  }

  // ---- rendering -----------------------------------------------------------

  function draw() {
    var rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);
    var item = activeImage();
    var hasPixels = item && item.element && item.width;
    emptyState.style.display = item ? "none" : "flex";
    imageName.textContent = item ? item.name : "No image loaded";
    if (activeImageName) { activeImageName.textContent = item ? item.name : "None"; activeImageName.title = item ? item.name : ""; }
    if (activeImageSize) activeImageSize.textContent = item && item.width ? item.width + " x " + item.height + " px" : (item ? "decoding..." : "");

    if (!item) { updateReadout(); return; }

    if (hasPixels) {
      ctx.save();
      ctx.translate(state.offsetX, state.offsetY);
      ctx.scale(state.scale, state.scale);
      ctx.imageSmoothingEnabled = state.scale < 3;
      // view-only brightness/contrast; restored so outlines aren't affected
      if (state.brightness !== 100 || state.contrast !== 100) {
        ctx.filter = "brightness(" + state.brightness + "%) contrast(" + state.contrast + "%)";
      }
      ctx.drawImage(item.element, 0, 0);
      ctx.restore();
    } else {
      ctx.save();
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.font = "14px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.fillText("Decoding " + item.name + " ...", rect.width / 2, rect.height / 2);
      ctx.restore();
    }

    if (state.showAll) {
      item.shapes.forEach(function (shape) { drawShape(shape, false); });
    } else {
      item.shapes.forEach(function (shape) {
        if (shape.feature === state.activeFeatureId) drawShape(shape, false);
      });
      if (state.currentStroke) {
        drawShape({ type: "polyline", color: activeFeature().color, points: state.currentStroke }, true);
      }
    }
    if ((state.tool === "edit" || state.tool === "erase") && !state.showAll && state.cursor && hasPixels && pointInImage(state.cursor, 6 / state.scale)) {
      var center = imageToScreen(state.cursor);
      ctx.save();
      ctx.beginPath();
      ctx.arc(center.x, center.y, editRadiusImg() * state.scale, 0, Math.PI * 2);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = state.tool === "erase" ? "#e0483b" : activeFeature().color;
      ctx.globalAlpha = 0.9;
      ctx.stroke();
      ctx.restore();
    }
    updateReadout();
  }

  function drawShape(shape, isPreview) {
    if (!shape.points.length) return;
    ctx.save();
    ctx.lineWidth = isPreview ? 2.5 : 2;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.strokeStyle = shape.color;
    ctx.fillStyle = shape.color;
    ctx.globalAlpha = isPreview ? 0.75 : 0.95;
    ctx.beginPath();
    shape.points.forEach(function (point, index) {
      var screen = imageToScreen(point);
      if (index === 0) ctx.moveTo(screen.x, screen.y);
      else ctx.lineTo(screen.x, screen.y);
    });
    if (shape.closed) ctx.closePath();
    ctx.stroke();
    // free-end handles: only for OPEN arcs, to show where the gap is
    if (shape.points.length > 1 && !isPreview && !shape.closed) {
      [shape.points[0], shape.points[shape.points.length - 1]].forEach(function (point) {
        var screen = imageToScreen(point);
        ctx.beginPath();
        ctx.arc(screen.x, screen.y, 4, 0, Math.PI * 2);
        ctx.fill();
      });
    }
    ctx.restore();
  }

  function updateReadout() {
    zoomLevel.textContent = Math.round(state.scale * 100) + "%";
    activeFeatureName.textContent = activeFeature().label;
    if (cursorCoord) {
      cursorCoord.textContent = state.cursor
        ? String(Math.round(state.cursor.x)).padStart(4, " ") + ", " + String(Math.round(state.cursor.y)).padStart(4, " ")
        : "  --,   --";
    }
  }

  function renderLists() { renderImages(); renderFeatures(); updateFlipButton(); }

  // ---- vertical flip (only before annotating; overwrites where allowed) -----

  function featureTotalPoints(item) {
    return item.shapes.reduce(function (n, s) { return n + s.points.length; }, 0);
  }
  function canFlip(item) {
    return !!(item && item.width && !item.hadJson && featureTotalPoints(item) === 0);
  }
  function updateFlipButton() {
    if (!flipBtn) return;
    var item = activeImage();
    var ok = canFlip(item);
    flipBtn.disabled = !ok;
    flipBtn.title = ok
      ? "Flip image vertically and save (do this before annotating)"
      : item && (item.hadJson || featureTotalPoints(item) > 0)
        ? "Flip is only available before annotating \u2014 this image already has annotations or a JSON"
        : "Load an image to flip";
  }
  async function tryOverwriteFile(item, blob) {
    var h = item.fileHandle;
    if (!h || !h.createWritable) return false;
    try {
      if (h.queryPermission) {
        var q = await h.queryPermission({ mode: "readwrite" });
        if (q !== "granted" && h.requestPermission) q = await h.requestPermission({ mode: "readwrite" });
        if (q !== "granted") return false;
      }
      var ws = await h.createWritable();
      await ws.write(blob);
      await ws.close();
      return true;
    } catch (e) { return false; }
  }
  async function flipActiveImage() {
    var item = activeImage();
    if (!canFlip(item)) return;
    if (!item.element) { setLoadStatus("Image still decoding \u2014 try again in a moment.", true); return; }
    var w = item.width, h = item.height;
    var cv = document.createElement("canvas");
    cv.width = w; cv.height = h;
    var cx = cv.getContext("2d");
    cx.save(); cx.translate(0, h); cx.scale(1, -1); cx.drawImage(item.element, 0, 0, w, h); cx.restore();
    var blob = await new Promise(function (res) { cv.toBlob(res, "image/jpeg", 0.95); });
    if (!blob) { setLoadStatus("Could not create the flipped image.", true); return; }
    // Replace the in-memory file with the flipped bytes: the original File handle
    // goes stale once we overwrite the file on disk, so re-decoding (after the
    // decode cache evicts this image) must use the flipped bytes, not the disk file.
    item.file = new File([blob], item.name, { type: "image/jpeg" });
    var url = URL.createObjectURL(blob);
    await new Promise(function (res) {
      var img = new Image();
      img.onload = function () {
        if (item.objectUrl) { try { URL.revokeObjectURL(item.objectUrl); } catch (_) {} }
        item.element = img; item.objectUrl = url; item._gray = null;
        if (state.decodeOrder.indexOf(item.id) === -1) state.decodeOrder.push(item.id);
        evictDecoded();
        res();
      };
      img.onerror = function () { res(); };
      img.src = url;
    });
    draw();
    var wrote = await tryOverwriteFile(item, blob);
    if (wrote) setLoadStatus("Flipped and saved \u201c" + item.name + "\u201d in place.", false);
    else { triggerDownload(blob, imageBasename(item.name) + ".jpg"); setLoadStatus("Flipped image downloaded \u2014 replace the original with it (in-place save isn\u2019t available on this device or way of opening).", false); }
    renderLists();
  }

  function renderImages() {
    imageList.innerHTML = "";
    if (!state.images.length) {
      var empty = document.createElement("div");
      empty.className = "list-empty";
      empty.textContent = "No images loaded yet.";
      imageList.appendChild(empty);
      return;
    }
    state.images.forEach(function (item) {
      var nFeat = features.filter(function (f) {
        return featureArcs(item, f.id).some(function (a) { return a.points.length; });
      }).length;
      var isActive = item.id === state.activeImageId;
      var button = document.createElement("button");
      button.className = "image-item" + (isActive ? " active" : "");
      button.type = "button";
      var dot = document.createElement("span");
      dot.className = "state-dot" + (isActive ? " done" : "");   // green = image being edited
      dot.title = isActive ? "Currently editing" : "";
      var label = document.createElement("span");
      label.className = "item-label";
      label.textContent = item.name;
      label.title = item.name;
      var count = document.createElement("span");
      count.className = "item-count";
      count.textContent = nFeat + "/" + features.length + (item.dirty ? " \u2022" : "");
      count.title = nFeat + " of " + features.length + " features annotated" + (item.dirty ? " \u2014 unsaved" : "");
      button.appendChild(dot);
      button.appendChild(label);
      button.appendChild(count);
      button.addEventListener("click", function () { requestActivateImage(item.id); });
      imageList.appendChild(button);
    });
  }

  // Switching image warns if the current one has unsaved JSON changes.
  function requestActivateImage(id) {
    if (id === state.activeImageId) return;
    var cur = activeImage();
    if (cur && cur.dirty) {
      showSaveDialog(cur,
        function () { if (downloadExport()) activateImage(id); },  // Save & continue
        function () { activateImage(id); });                        // Continue without saving
      return;
    }
    activateImage(id);
  }

  function showSaveDialog(item, onSave, onDiscard) {
    var overlay = document.createElement("div");
    overlay.className = "confirm-modal";
    var card = document.createElement("div");
    card.className = "confirm-card";
    var msg = document.createElement("div");
    msg.className = "confirm-msg";
    var strong = document.createElement("strong");
    strong.textContent = "Unsaved changes";
    var p = document.createElement("p");
    p.textContent = "You haven\u2019t saved the JSON for \u201c" + item.name + "\u201d. Save it before switching so your work isn\u2019t lost?";
    msg.appendChild(strong); msg.appendChild(p);
    var actions = document.createElement("div");
    actions.className = "confirm-actions";
    function mk(text, cls) { var b = document.createElement("button"); b.type = "button"; b.className = "confirm-btn " + cls; b.textContent = text; return b; }
    var bCancel = mk("Cancel", "ghost");
    var bDiscard = mk("Continue without saving", "");
    var bSave = mk("Save & continue", "primary");
    function close() { overlay.remove(); }
    bCancel.addEventListener("click", close);
    bDiscard.addEventListener("click", function () { close(); onDiscard(); });
    bSave.addEventListener("click", function () { close(); onSave(); });
    overlay.addEventListener("click", function (e) { if (e.target === overlay) close(); });
    actions.appendChild(bCancel); actions.appendChild(bDiscard); actions.appendChild(bSave);
    card.appendChild(msg); card.appendChild(actions);
    overlay.appendChild(card);
    document.body.appendChild(overlay);
  }

  function renderFeatures() {
    featureList.innerHTML = "";
    var item = activeImage();
    features.forEach(function (feature) {
      var count = item ? featurePointCount(item, feature.id) : 0;
      var status = item ? featureStatus(item, feature.id) : "empty";
      var tile = document.createElement("button");
      tile.className = "feature-tile" + (!state.showAll && feature.id === state.activeFeatureId ? " active" : "");
      tile.type = "button";
      tile.style.setProperty("--feat", feature.color);

      var name = document.createElement("span");
      name.className = "tile-name";
      name.textContent = feature.label;

      var statusEl = document.createElement("span");
      statusEl.className = "tile-status";
      var dot = document.createElement("span");
      dot.className = "status-dot " + (status === "done" ? "done" : status === "open" ? "warn" : "missing");
      dot.title = status === "done" ? "Annotated" : status === "open" ? "Open contour \u2014 connect the ends" : "Not annotated";
      var cnt = document.createElement("span");
      cnt.className = "tile-count";
      cnt.textContent = status === "open" ? "open" : count ? count + " pts" : "none";
      statusEl.appendChild(dot);
      statusEl.appendChild(cnt);

      tile.appendChild(name);
      tile.appendChild(statusEl);
      tile.addEventListener("click", function () { setActiveFeature(feature.id); });
      featureList.appendChild(tile);
    });
    if (allFeaturesBtn) {
      allFeaturesBtn.classList.toggle("active", state.showAll);
      allFeaturesBtn.setAttribute("aria-pressed", state.showAll ? "true" : "false");
    }
  }

  function setActiveFeature(id) {
    var item = activeImage();
    if (item && state.activeFeatureId && state.activeFeatureId !== id) stitchFeatureQuiet(item, state.activeFeatureId);
    state.activeFeatureId = id;
    state.showAll = false;        // choosing a feature exits review mode
    state.currentStroke = null;
    applyReviewMode();
    renderFeatures();
    draw();
  }

  function setShowAll(on) {
    var item = activeImage();
    if (on && item) features.forEach(function (f) { stitchFeatureQuiet(item, f.id); });
    state.showAll = Boolean(on);
    state.currentStroke = null;
    applyReviewMode();
    renderFeatures();
    draw();
  }

  function applyReviewMode() {
    if (appShell) appShell.classList.toggle("review-mode", state.showAll);
    if (reviewBadge) reviewBadge.classList.toggle("visible", state.showAll && !!activeImage());
    updateWorkRow2();
    updateCanvasCursor();
  }

  function updateDirtyBadge() {
    var item = activeImage();
    if (unsavedBadge) unsavedBadge.classList.toggle("visible", !!(item && item.dirty));
  }
  function markDirty(item) {
    if (!item) return;
    item.dirty = true;
    if (item.id === state.activeImageId) updateDirtyBadge();
  }

  // ---- shapes / editing ----------------------------------------------------

  function pushHistory(action) {
    state.history.push(action);
    if (state.history.length > 300) state.history.shift();
  }

  function makeArcShape(featureId, points, closed) {
    var feature = featureById(featureId) || activeFeature();
    return {
      id: featureId + "_" + Date.now() + "_" + Math.random().toString(16).slice(2),
      feature: featureId,
      label: feature.label,
      type: "polyline",
      color: feature.color,
      closed: !!closed,
      points: points.map(function (p) { return { x: Number(p.x.toFixed(1)), y: Number(p.y.toFixed(1)) }; })
    };
  }
  // kept name for import/restore call sites
  function rebuildShape(featureId, points, closed) {
    return makeArcShape(featureId, points, closed === undefined ? true : closed);
  }
  function cloneArc(a) {
    return { id: a.id, feature: a.feature, label: a.label, color: a.color, type: a.type,
      closed: a.closed, points: a.points.map(function (p) { return { x: p.x, y: p.y }; }) };
  }

  // ---- feature = a set of arcs (open polylines) or one closed loop ----------

  function featureArcs(item, fid) {
    return item.shapes.filter(function (s) { return s.feature === fid; });
  }
  function setFeatureArcs(item, fid, arcs) {
    item.shapes = item.shapes.filter(function (s) { return s.feature !== fid; }).concat(arcs);
  }
  function snapshotFeature(item, fid) {
    return featureArcs(item, fid).map(cloneArc);
  }
  function featurePointCount(item, fid) {
    return featureArcs(item, fid).reduce(function (n, a) { return n + a.points.length; }, 0);
  }
  function featureStatus(item, fid) {
    var arcs = featureArcs(item, fid).filter(function (a) { return a.points.length; });
    if (!arcs.length) return "empty";
    if (arcs.length === 1 && arcs[0].closed) return "done";
    var stitched = geomStitch(arcs, fid, stitchTol(), false);
    return (stitched.length === 1 && stitched[0].closed) ? "done" : "open";
  }
  function commitFeature(item, fid, before) {
    pushHistory({ kind: "featureArcs", imageId: item.id, feature: fid, before: before });
    renderLists();
    draw();
    scheduleAutosave(item);
    markDirty(item);
  }
  function weldThreshold() { return Math.max(editRadiusImg(), 8 / state.scale); }
  function stitchTol() { var it = activeImage(); return Math.max(editRadiusImg(), (it && it.height ? it.height : 400) * 0.015); }

  // ---- arc geometry ---------------------------------------------------------

  function runsLinear(points, keep) {
    var runs = [], cur = [];
    for (var i = 0; i < points.length; i += 1) {
      if (keep[i]) cur.push(points[i]); else { if (cur.length) runs.push(cur); cur = []; }
    }
    if (cur.length) runs.push(cur);
    return runs;
  }
  function runsCyclic(points, keep) {
    var runs = runsLinear(points, keep);
    if (runs.length > 1 && keep[0] && keep[points.length - 1]) { var last = runs.pop(); runs[0] = last.concat(runs[0]); }
    return runs;
  }
  function geomErase(arcs, c, r, fid) {
    var out = [];
    arcs.forEach(function (arc) {
      var keep = arc.points.map(function (p) { return distance(p, c) >= r; });
      if (keep.every(Boolean)) { out.push(arc); return; }
      var runs = arc.closed ? runsCyclic(arc.points, keep) : runsLinear(arc.points, keep);
      runs.forEach(function (run) { if (run.length >= 2) out.push(makeArcShape(fid, run, false)); });
    });
    return out;
  }
  function smoothJunction(points, idx, lambda, span) {
    var n = points.length;
    for (var i = Math.max(1, idx - span); i <= Math.min(n - 2, idx + span); i += 1) {
      var a = points[i - 1], b = points[i + 1];
      points[i] = { x: points[i].x + lambda * ((a.x + b.x) / 2 - points[i].x), y: points[i].y + lambda * ((a.y + b.y) / 2 - points[i].y) };
    }
    return points;
  }
  function joinEnds(aArc, ea, bArc, eb) {
    var A = ea === 1 ? aArc.points.slice() : aArc.points.slice().reverse();
    var B = eb === 0 ? bArc.points.slice() : bArc.points.slice().reverse();
    var merged = A.concat(B.slice(1));
    return smoothJunction(merged, A.length - 1, 0.4, 2);
  }
  function geomStitch(arcs, fid, threshold, forceClose) {
    arcs = arcs.map(function (a) { return makeArcShape(fid, a.points, a.closed); });
    while (true) {
      var openIdx = [];
      for (var k = 0; k < arcs.length; k += 1) if (!arcs[k].closed) openIdx.push(k);
      if (openIdx.length <= 1) break;
      var best = null;
      for (var a = 0; a < openIdx.length; a += 1) for (var b = a + 1; b < openIdx.length; b += 1) {
        var i = openIdx[a], j = openIdx[b];
        for (var ei = 0; ei < 2; ei += 1) for (var ej = 0; ej < 2; ej += 1) {
          var pi = ei === 0 ? arcs[i].points[0] : arcs[i].points[arcs[i].points.length - 1];
          var pj = ej === 0 ? arcs[j].points[0] : arcs[j].points[arcs[j].points.length - 1];
          var d = distance(pi, pj);
          if (!best || d < best.d) best = { i: i, j: j, ei: ei, ej: ej, d: d };
        }
      }
      if (!best || (!forceClose && best.d > threshold)) break;
      var merged = joinEnds(arcs[best.i], best.ei, arcs[best.j], best.ej);
      var ni = [];
      for (var m = 0; m < arcs.length; m += 1) if (m !== best.i && m !== best.j) ni.push(arcs[m]);
      ni.push(makeArcShape(fid, merged, false));
      arcs = ni;
    }
    var open = arcs.filter(function (a) { return !a.closed; });
    if (open.length === 1) {
      var only = open[0];
      var d2 = distance(only.points[0], only.points[only.points.length - 1]);
      if (forceClose || d2 <= threshold) only.closed = true;
    }
    return arcs;
  }
  function geomWeld(arcs, strokePts, fid, threshold) {
    var freeEnds = [];
    arcs.forEach(function (arc) { if (!arc.closed) { freeEnds.push(arc.points[0]); freeEnds.push(arc.points[arc.points.length - 1]); } });
    var s = strokePts.slice();
    var capture = Math.max(threshold, 6 / state.scale);
    function nearest(pt) { var best = null; freeEnds.forEach(function (p) { var d = distance(pt, p); if (!best || d < best.d) best = { p: p, d: d }; }); return best; }
    if (freeEnds.length) {
      var sn = nearest(s[0]);
      if (sn && sn.d <= capture) { var ti = 0, td = Infinity; for (var i = 0; i < Math.min(s.length, 30); i += 1) { var d = distance(s[i], sn.p); if (d < td) { td = d; ti = i; } } s = s.slice(ti); }
      var en = nearest(s[s.length - 1]);
      if (en && en.d <= capture) { var tj = s.length - 1, tjd = Infinity; for (var q = s.length - 1; q >= Math.max(0, s.length - 30); q -= 1) { var dq = distance(s[q], en.p); if (dq < tjd) { tjd = dq; tj = q; } } s = s.slice(0, tj + 1); }
    }
    if (s.length < 2) return arcs.slice();
    return geomStitch(arcs.concat([makeArcShape(fid, s, false)]), fid, threshold, false);
  }

  // ---- draw / erase / edit finish -------------------------------------------

  function onDrawFinish(points) {
    var item = activeImage();
    var feature = activeFeature();
    if (!item || points.length < 2) return;
    var before = snapshotFeature(item, feature.id);
    var status = featureStatus(item, feature.id);
    var arcs;
    if (status === "open") {
      // add another piece: weld to nearby loose ends, else it's a new open arc
      arcs = geomWeld(featureArcs(item, feature.id), points, feature.id, weldThreshold());
    } else {
      // empty, or starting over on a finished loop: the stroke is one open piece
      // (geomStitch closes it only if its own ends already meet)
      arcs = geomStitch([makeArcShape(feature.id, points, false)], feature.id, weldThreshold(), false);
    }
    setFeatureArcs(item, feature.id, arcs);
    commitFeature(item, feature.id, before);
  }

  // Erase brush: cut points of the ACTIVE feature inside the brush, splitting arcs.
  function eraseBrush(e) {
    var item = activeImage();
    if (!item || !state.action) return;
    var fid = state.action.feature;
    var radius = editRadiusImg();
    var events = (e.getCoalescedEvents && e.getCoalescedEvents()) || [];
    if (!events.length) events = [e];
    var changed = false;
    for (var k = 0; k < events.length; k += 1) {
      var c = screenToImage(events[k].clientX, events[k].clientY);
      var arcs = featureArcs(item, fid);
      var beforeN = arcs.reduce(function (n, a) { return n + a.points.length; }, 0);
      var na = geomErase(arcs, c, radius, fid);
      var afterN = na.reduce(function (n, a) { return n + a.points.length; }, 0);
      if (afterN !== beforeN) { setFeatureArcs(item, fid, na); changed = true; }
    }
    if (changed) draw();
  }

  function undo() {
    var action = state.history.pop();
    if (!action) return;
    var item = state.images.find(function (image) { return image.id === action.imageId; });
    if (!item) return;
    if (action.kind === "featureArcs") setFeatureArcs(item, action.feature, action.before.map(cloneArc));
    renderLists();
    draw();
    scheduleAutosave(item);
    markDirty(item);
  }

  function clearActiveFeature() {
    var item = activeImage();
    var feature = activeFeature();
    if (!item || !featureArcs(item, feature.id).length) return;
    var before = snapshotFeature(item, feature.id);
    setFeatureArcs(item, feature.id, []);
    commitFeature(item, feature.id, before);
  }

  function joinLooseEnds() {
    var item = activeImage();
    if (!item) return;
    var fid = state.activeFeatureId;
    if (featureStatus(item, fid) !== "open") { setLoadStatus("Nothing to join for " + activeFeature().label + ".", false); return; }
    var before = snapshotFeature(item, fid);
    setFeatureArcs(item, fid, geomStitch(featureArcs(item, fid), fid, Infinity, true));
    commitFeature(item, fid, before);
    setLoadStatus("Joined loose ends of " + activeFeature().label + ".", false);
  }

  // auto-join small gaps when leaving a feature / entering review / saving
  function stitchFeatureQuiet(item, fid) {
    var arcs = featureArcs(item, fid);
    if (arcs.length <= 1 && (!arcs.length || arcs[0].closed)) return;
    var stitched = geomStitch(arcs, fid, stitchTol(), false);
    if (stitched.length !== arcs.length || stitched.some(function (a, i) { return !arcs[i] || a.closed !== arcs[i].closed; })) {
      setFeatureArcs(item, fid, stitched);
      scheduleAutosave(item);
    }
  }

  // ---- autosave (IndexedDB, keyed by image basename) -----------------------

  var savedByName = {};       // basename -> { basename, shapes:[{feature,points}], width, height, savedAt }
  var dbPromise = null;
  var autosaveTimers = {};

  function idbAvailable() {
    try { return typeof indexedDB !== "undefined" && indexedDB; } catch (e) { return false; }
  }
  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      if (!idbAvailable()) { reject(new Error("no indexeddb")); return; }
      var req = indexedDB.open("fishAnnotator", 1);
      req.onupgradeneeded = function () { req.result.createObjectStore("annotations", { keyPath: "basename" }); };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
    return dbPromise;
  }
  function idbPut(record) {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction("annotations", "readwrite");
        tx.objectStore("annotations").put(record);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }
  function idbLoadAll() {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var out = {};
        var tx = db.transaction("annotations", "readonly");
        var cursor = tx.objectStore("annotations").openCursor();
        cursor.onsuccess = function (e) {
          var c = e.target.result;
          if (c) { out[c.value.basename] = c.value; c.continue(); }
          else resolve(out);
        };
        cursor.onerror = function () { reject(cursor.error); };
      });
    });
  }

  function serializeShapes(item) {
    return item.shapes.map(function (s) { return { feature: s.feature, points: s.points, closed: s.closed !== false }; });
  }
  function scheduleAutosave(item) {
    if (!item) return;
    var base = matchKey(item.name);
    var record = { basename: base, shapes: serializeShapes(item), width: item.width, height: item.height, savedAt: Date.now() };
    savedByName[base] = record;
    window.clearTimeout(autosaveTimers[base]);
    autosaveTimers[base] = window.setTimeout(function () {
      idbPut(record).catch(function () {});   // silent: for resuming this image later
    }, 350);
  }
  function restoreShapesForItem(item) {
    var rec = savedByName[matchKey(item.name)] || savedByName[imageBasename(item.name)];
    if (!rec || !rec.shapes || !rec.shapes.length) return;
    item.shapes = rec.shapes.map(function (r) { return rebuildShape(r.feature, r.points, r.closed !== false); });
  }

  function parseFishInspector(obj) {
    var shapes = [];
    features.forEach(function (feature) {
      var node = obj[feature.id];
      if (!node || !node.shape || !node.shape.x || !node.shape.y) return;
      var xs = node.shape.x, ys = node.shape.y;
      var pts = [];
      for (var i = 0; i < xs.length; i += 1) pts.push({ x: xs[i], y: ys[i] });
      if (pts.length) shapes.push({ feature: feature.id, points: pts, closed: true });
    });
    return shapes;
  }

  function findImageForKey(key) {
    return state.images.find(function (im) { return matchKey(im.name) === key; }) || null;
  }

  // Put a parsed annotation set onto a specific image and persist it.
  function attachAnnotations(item, shapes) {
    item.shapes = shapes.map(function (r) { return rebuildShape(r.feature, r.points, r.closed !== false); });
    item.dirty = false;   // freshly loaded from a JSON file: nothing to save yet
    item.hadJson = true;  // has annotations from a JSON -> flip disabled
    var key = matchKey(item.name);
    var record = { basename: key, shapes: serializeShapes(item), width: item.width, height: item.height, savedAt: Date.now() };
    savedByName[key] = record;
    idbPut(record).catch(function () {});
    if (item.id === state.activeImageId) { draw(); updateDirtyBadge(); }
  }

  // Read JSON files, attach to matching images by tolerant key, else stash.
  async function ingestJsonFiles(jsonFiles) {
    var matched = [], unmatched = [], failed = 0;
    for (var i = 0; i < jsonFiles.length; i += 1) {
      var parsed = null;
      try {
        var obj = JSON.parse(await jsonFiles[i].text());
        parsed = { key: matchKey(jsonFiles[i].name), shapes: parseFishInspector(obj), name: jsonFiles[i].name };
      } catch (e) { failed += 1; continue; }
      var item = findImageForKey(parsed.key);
      if (item) { attachAnnotations(item, parsed.shapes); matched.push(item); }
      else {
        savedByName[parsed.key] = { basename: parsed.key, shapes: parsed.shapes, savedAt: Date.now() };
        idbPut(savedByName[parsed.key]).catch(function () {});
        unmatched.push(parsed);
      }
    }
    return { matched: matched, unmatched: unmatched, failed: failed };
  }

  // ---- image loading (lazy decode) -----------------------------------------

  function loadBrowserImage(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () { resolve({ element: img, width: img.naturalWidth, height: img.naturalHeight, objectUrl: url }); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error("browser could not decode image.")); };
      img.src = url;
    });
  }

  function evictDecoded() {
    while (state.decodeOrder.length > DECODE_CACHE_MAX) {
      var oldestId = state.decodeOrder.shift();
      if (oldestId === state.activeImageId) { state.decodeOrder.push(oldestId); continue; }
      var item = state.images.find(function (im) { return im.id === oldestId; });
      if (item) {
        if (item.objectUrl) { URL.revokeObjectURL(item.objectUrl); item.objectUrl = null; }
        item.element = null;
        item._gray = null;
      }
      if (state.decodeOrder.length <= DECODE_CACHE_MAX) break;
    }
  }

  function ensureDecoded(item) {
    if (item.element) return Promise.resolve(item);
    if (item._decoding) return item._decoding;
    var task = (isTiffFile(item.file) ? decodeTiffToCanvas(item.file).then(function (cv) {
      return { element: cv, width: cv.width, height: cv.height, objectUrl: null };
    }) : loadBrowserImage(item.file)).then(function (decoded) {
      item.element = decoded.element;
      item.width = decoded.width;
      item.height = decoded.height;
      item.objectUrl = decoded.objectUrl;
      item._decoding = null;
      state.decodeOrder.push(item.id);
      evictDecoded();
      if (item.id === state.activeImageId) updateFlipButton();
      return item;
    }).catch(function (err) {
      item._decoding = null;
      item.error = err && err.message ? err.message : "decode failed";
      throw err;
    });
    item._decoding = task;
    return task;
  }

  function activateImage(id) {
    state.activeImageId = id;
    state.currentStroke = null;
    state.history = [];
    var item = activeImage();
    renderLists();
    draw();
    updateDirtyBadge();
    if (!item) return;
    if (item.element) { fitImage(); return; }
    setLoadStatus("Opening " + item.name + "...", false);
    ensureDecoded(item).then(function () {
      setLoadStatus("Loaded " + item.name, false);
      renderLists();
      fitImage();
    }).catch(function (err) {
      setLoadStatus(item.name + ": " + (err && err.message ? err.message : "could not open"), true);
      draw();
    });
  }

  function registerFile(file, handle) {
    var name = file.webkitRelativePath || file.name;
    var item = {
      id: name + "_" + (file.lastModified || 0) + "_" + Math.random().toString(16).slice(2),
      name: name,
      file: file,
      fileHandle: handle || null,
      hadJson: false,
      width: 0,
      height: 0,
      element: null,
      objectUrl: null,
      _gray: null,
      _decoding: null,
      dirty: false,
      shapes: []
    };
    restoreShapesForItem(item);
    state.images.push(item);
    return item;
  }

  async function loadFiles(files, source, handleMap) {
    var incoming = Array.from(files || []);
    var sourceName = source || "drop";
    setLoadDetails([]);
    if (!incoming.length) {
      setLoadStatus("No files selected from " + sourceName + ".", false);
      return;
    }
    var jsonFiles = incoming.filter(function (f) { return /\.json$/i.test(f.name || ""); });
    var candidates = incoming.filter(isImageCandidate);
    var unsupported = incoming.length - candidates.length - jsonFiles.length;

    candidates.sort(function (a, b) { return (a.name || "").localeCompare(b.name || "", undefined, { numeric: true }); });
    var firstNewId = null;
    candidates.forEach(function (file) {
      var item = registerFile(file, handleMap && handleMap[file.name]);
      if (firstNewId === null) firstNewId = item.id;
    });

    var res = await ingestJsonFiles(jsonFiles);
    renderLists();
    if (!state.activeImageId && firstNewId) activateImage(firstNewId);

    var act = activeImage();
    // Fallback: a lone unmatched JSON attaches to the image you're viewing
    // (covers "image + its JSON together" and "just the JSON onto this image").
    if (act && !act.shapes.length && res.unmatched.length === 1 && candidates.length <= 1) {
      attachAnnotations(act, res.unmatched[0].shapes);
      res.matched.push(act);
      res.unmatched = [];
      renderLists();
    }
    if (act && act.shapes.length && res.matched.some(function (it) { return it.id === act.id; })) setShowAll(true);

    var notes = [];
    if (res.matched.length || res.unmatched.length) notes.push((res.matched.length + res.unmatched.length) + " annotation file(s) loaded");
    if (res.unmatched.length) notes.push(res.unmatched.length + " didn't match a loaded image");
    if (unsupported > 0) notes.push(unsupported + " other file(s) ignored");
    if (candidates.length) {
      setLoadStatus("Loaded " + candidates.length + " image" + (candidates.length === 1 ? "" : "s") +
        (notes.length ? ". " + notes.join("; ") + "." : ". Images decode when opened."), false);
    } else if (res.matched.length || res.unmatched.length) {
      setLoadStatus((res.matched.length + res.unmatched.length) + " annotation file(s) loaded. Open the matching image to see them.", res.unmatched.length > 0);
    } else {
      setLoadStatus("No images or annotation files found among " + incoming.length + " selected.", true);
    }
  }
  function getTiffTypeSize(type) {
    if (type === 1 || type === 2 || type === 6 || type === 7) return 1;
    if (type === 3 || type === 8) return 2;
    if (type === 4 || type === 9 || type === 11) return 4;
    if (type === 5 || type === 10 || type === 12) return 8;
    return 0;
  }

  function readTiffValue(view, offset, type, little) {
    if (type === 1 || type === 7) return view.getUint8(offset);
    if (type === 3) return view.getUint16(offset, little);
    if (type === 4) return view.getUint32(offset, little);
    if (type === 6) return view.getInt8(offset);
    if (type === 8) return view.getInt16(offset, little);
    if (type === 9) return view.getInt32(offset, little);
    if (type === 11) return view.getFloat32(offset, little);
    if (type === 12) return view.getFloat64(offset, little);
    throw new Error("Unsupported TIFF field type " + type + ".");
  }

  function readTiffArray(view, entryOffset, type, count, little) {
    var typeSize = getTiffTypeSize(type);
    if (!typeSize) throw new Error("Unsupported TIFF field type " + type + ".");
    var totalBytes = typeSize * count;
    var valueOffset = totalBytes <= 4 ? entryOffset + 8 : view.getUint32(entryOffset + 8, little);
    var values = [];
    for (var i = 0; i < count; i += 1) {
      if (type === 5 || type === 10) {
        var num = readTiffValue(view, valueOffset + i * typeSize, type === 5 ? 4 : 9, little);
        var den = readTiffValue(view, valueOffset + i * typeSize + 4, type === 5 ? 4 : 9, little);
        values.push(den ? num / den : 0);
      } else {
        values.push(readTiffValue(view, valueOffset + i * typeSize, type, little));
      }
    }
    return values;
  }

  function parseTiffTags(view, ifdOffset, little) {
    var entryCount = view.getUint16(ifdOffset, little);
    var tags = {};
    for (var i = 0; i < entryCount; i += 1) {
      var entryOffset = ifdOffset + 2 + i * 12;
      var tag = view.getUint16(entryOffset, little);
      var type = view.getUint16(entryOffset + 2, little);
      var count = view.getUint32(entryOffset + 4, little);
      tags[tag] = readTiffArray(view, entryOffset, type, count, little);
    }
    return tags;
  }

  function decodePackBits(bytes, expectedLength) {
    var output = new Uint8Array(expectedLength);
    var inPos = 0;
    var outPos = 0;
    while (inPos < bytes.length && outPos < expectedLength) {
      var header = bytes[inPos++];
      var signed = header > 127 ? header - 256 : header;
      if (signed >= 0 && signed <= 127) {
        var copyCount = signed + 1;
        output.set(bytes.subarray(inPos, Math.min(inPos + copyCount, bytes.length)), outPos);
        inPos += copyCount;
        outPos += copyCount;
      } else if (signed >= -127 && signed <= -1) {
        var repeatCount = 1 - signed;
        var value = bytes[inPos++];
        output.fill(value, outPos, Math.min(outPos + repeatCount, expectedLength));
        outPos += repeatCount;
      }
    }
    return output;
  }

  function getTiffBytes(view, offsets, byteCounts, compression, expectedLength) {
    var chunks = [];
    var total = 0;
    for (var i = 0; i < offsets.length; i += 1) {
      var start = offsets[i];
      var count = byteCounts[i] || byteCounts[0];
      var chunk = new Uint8Array(view.buffer, start, count);
      chunks.push(chunk);
      total += chunk.length;
    }
    var joined = new Uint8Array(total);
    var pos = 0;
    chunks.forEach(function (chunk) {
      joined.set(chunk, pos);
      pos += chunk.length;
    });
    if (compression === 1) return joined;
    if (compression === 32773) return decodePackBits(joined, expectedLength);
    throw new Error("Unsupported TIFF compression " + compression + ". Supported: uncompressed and PackBits.");
  }

  function sampleAt(bytes, byteIndex, bits, little) {
    if (bits === 8) return bytes[byteIndex];
    if (bits === 16) {
      if (little) return bytes[byteIndex] + bytes[byteIndex + 1] * 256;
      return bytes[byteIndex] * 256 + bytes[byteIndex + 1];
    }
    throw new Error("Unsupported TIFF bit depth " + bits + ". Supported: 8-bit and 16-bit.");
  }

  function scaleSample(value, bits, invert) {
    var max = bits === 16 ? 65535 : 255;
    var scaled = Math.round((value / max) * 255);
    return invert ? 255 - scaled : scaled;
  }

  async function decodeTiffToCanvas(file) {
    var buffer = await file.arrayBuffer();
    var view = new DataView(buffer);
    var byteOrder = String.fromCharCode(view.getUint8(0), view.getUint8(1));
    var little;
    if (byteOrder === "II") little = true;
    else if (byteOrder === "MM") little = false;
    else throw new Error("Not a TIFF file: missing byte-order marker.");

    var magic = view.getUint16(2, little);
    if (magic === 43) throw new Error("BigTIFF is not supported yet.");
    if (magic !== 42) throw new Error("Not a standard TIFF file.");

    var ifdOffset = view.getUint32(4, little);
    var tags = parseTiffTags(view, ifdOffset, little);
    var width = tags[256] && tags[256][0];
    var height = tags[257] && tags[257][0];
    if (!width || !height) throw new Error("TIFF is missing width or height tags.");

    var bitsPerSample = tags[258] || [1];
    var compression = tags[259] ? tags[259][0] : 1;
    var photometric = tags[262] ? tags[262][0] : 1;
    var stripOffsets = tags[273] || [];
    var samplesPerPixel = tags[277] ? tags[277][0] : bitsPerSample.length;
    var stripByteCounts = tags[279] || [];
    var planar = tags[284] ? tags[284][0] : 1;
    var sampleFormat = tags[339] ? tags[339][0] : 1;

    if (!stripOffsets.length || !stripByteCounts.length) throw new Error("TIFF strips are missing or unsupported.");
    if (planar !== 1) throw new Error("Planar TIFF files are not supported yet.");
    if (sampleFormat !== 1) throw new Error("Only unsigned-integer TIFF samples are supported yet.");
    if (photometric !== 0 && photometric !== 1 && photometric !== 2) throw new Error("Unsupported TIFF color mode " + photometric + ". Supported: grayscale and RGB.");

    var primaryBits = bitsPerSample[0];
    if (primaryBits !== 8 && primaryBits !== 16) throw new Error("Unsupported TIFF bit depth " + primaryBits + ". Supported: 8-bit and 16-bit.");
    if (photometric === 2 && samplesPerPixel < 3) throw new Error("RGB TIFF has fewer than 3 samples per pixel.");

    var bytesPerSample = primaryBits / 8;
    var bytesPerPixel = samplesPerPixel * bytesPerSample;
    var expectedLength = width * height * bytesPerPixel;
    var pixelBytes = getTiffBytes(view, stripOffsets, stripByteCounts, compression, expectedLength);

    var imageData = new ImageData(width, height);
    var out = imageData.data;
    var invertGray = photometric === 0;
    for (var pixel = 0; pixel < width * height; pixel += 1) {
      var base = pixel * bytesPerPixel;
      var outBase = pixel * 4;
      if (photometric === 2) {
        out[outBase] = scaleSample(sampleAt(pixelBytes, base, primaryBits, little), primaryBits, false);
        out[outBase + 1] = scaleSample(sampleAt(pixelBytes, base + bytesPerSample, primaryBits, little), primaryBits, false);
        out[outBase + 2] = scaleSample(sampleAt(pixelBytes, base + bytesPerSample * 2, primaryBits, little), primaryBits, false);
        out[outBase + 3] = samplesPerPixel >= 4 ? scaleSample(sampleAt(pixelBytes, base + bytesPerSample * 3, primaryBits, little), primaryBits, false) : 255;
      } else {
        var gray = scaleSample(sampleAt(pixelBytes, base, primaryBits, little), primaryBits, invertGray);
        out[outBase] = gray;
        out[outBase + 1] = gray;
        out[outBase + 2] = gray;
        out[outBase + 3] = 255;
      }
    }

    var decodedCanvas = document.createElement("canvas");
    decodedCanvas.width = width;
    decodedCanvas.height = height;
    decodedCanvas.getContext("2d").putImageData(imageData, 0, 0);
    return decodedCanvas;
  }
  // ---- FishInspector-compatible export -------------------------------------
  //
  // Output mirrors the __SHAPES.json files written by FishInspector: one file
  // per image, named <image-basename>__SHAPES.json, with the structure:
  //   { version, enabled, imageDimensions:[w,h,c],
  //     <feature>_net: { mode, parameter, shape:{name,x,y}, regionprops },
  //     imageBackground: {...} }
  // Coordinates live in parallel x[] / y[] arrays. regionprops and
  // imageBackground are measurement fields that FishInspector recomputes on
  // load; we fill them from the traced outline and image pixels for fidelity.

  var FI_VERSION = 0.99;

  function imageBasename(name) {
    var base = String(name || "image");
    var slash = Math.max(base.lastIndexOf("/"), base.lastIndexOf("\\"));
    if (slash >= 0) base = base.slice(slash + 1);
    var dot = base.lastIndexOf(".");
    if (dot > 0) base = base.slice(0, dot);
    return base;
  }

  // Tolerant key for pairing an image with its annotation JSON. Names from
  // FishInspector and from disk often differ (spaces vs underscores, parens,
  // .ome / .tif suffixes, __SHAPES), so we normalize aggressively.
  function matchKey(name) {
    var b = String(name || "");
    var slash = Math.max(b.lastIndexOf("/"), b.lastIndexOf("\\"));
    if (slash >= 0) b = b.slice(slash + 1);
    b = b.replace(/\.json$/i, "");
    b = b.replace(/_+shapes$/i, "");
    b = b.replace(/\.(tif|tiff|jpg|jpeg|png|bmp|gif|webp)$/i, "");
    b = b.toLowerCase();
    b = b.replace(/[^a-z0-9]+/g, "");   // drop spaces, underscores, parens, dashes, dots
    b = b.replace(/ome$/, "");          // OME-TIFF marker, in any separator form
    return b;
  }

  function round1(value) {
    return Math.round(value * 10) / 10;
  }

  // Lazily rasterize an image to a grayscale byte buffer for intensity stats.
  function getGrayscale(item) {
    if (item._gray) return item._gray;
    var w = item.width;
    var h = item.height;
    var off = document.createElement("canvas");
    off.width = w;
    off.height = h;
    var offCtx = off.getContext("2d");
    offCtx.drawImage(item.element, 0, 0, w, h);
    var rgba = offCtx.getImageData(0, 0, w, h).data;
    var gray = new Uint8ClampedArray(w * h);
    for (var i = 0, p = 0; i < gray.length; i += 1, p += 4) {
      gray[i] = Math.round(0.299 * rgba[p] + 0.587 * rgba[p + 1] + 0.114 * rgba[p + 2]);
    }
    item._gray = { w: w, h: h, data: gray };
    return item._gray;
  }

  // regionprops over the filled polygon, matching FishInspector's field set.
  function computeRegionProps(points, gray) {
    var xs = points.map(function (p) { return p.x; });
    var ys = points.map(function (p) { return p.y; });
    var xMin = Math.min.apply(null, xs);
    var xMax = Math.max.apply(null, xs);
    var yMin = Math.min.apply(null, ys);
    var yMax = Math.max.apply(null, ys);

    var area = 0, sumX = 0, sumY = 0, sumI = 0, minI = 255, maxI = 0;
    var n = points.length;
    var y0 = Math.max(0, Math.floor(yMin));
    var y1 = Math.min(gray.h - 1, Math.ceil(yMax));
    for (var y = y0; y <= y1; y += 1) {
      var crossings = [];
      for (var i = 0; i < n; i += 1) {
        var a = points[i];
        var b = points[(i + 1) % n];
        if ((a.y <= y && b.y > y) || (b.y <= y && a.y > y)) {
          crossings.push(a.x + (y - a.y) / (b.y - a.y) * (b.x - a.x));
        }
      }
      crossings.sort(function (p, q) { return p - q; });
      for (var k = 0; k + 1 < crossings.length; k += 2) {
        var xa = Math.max(0, Math.ceil(crossings[k]));
        var xb = Math.min(gray.w - 1, Math.floor(crossings[k + 1]));
        for (var x = xa; x <= xb; x += 1) {
          var v = gray.data[y * gray.w + x];
          area += 1; sumX += x; sumY += y; sumI += v;
          if (v < minI) minI = v;
          if (v > maxI) maxI = v;
        }
      }
    }

    if (area === 0) {
      // Degenerate/thin outline: sample intensity at the vertices instead.
      var cx = 0, cy = 0;
      minI = 255; maxI = 0; sumI = 0;
      for (var j = 0; j < n; j += 1) {
        cx += points[j].x; cy += points[j].y;
        var px = Math.min(gray.w - 1, Math.max(0, Math.round(points[j].x)));
        var py = Math.min(gray.h - 1, Math.max(0, Math.round(points[j].y)));
        var g = gray.data[py * gray.w + px];
        sumI += g;
        if (g < minI) minI = g;
        if (g > maxI) maxI = g;
      }
      return {
        Area: 0, Centroid: [cx / n, cy / n],
        MeanIntensity: sumI / n, MinIntensity: minI, MaxIntensity: maxI,
        XMin: round1(xMin), XMax: round1(xMax), YMin: round1(yMin), YMax: round1(yMax),
        Width: round1(xMax - xMin), Height: round1(yMax - yMin)
      };
    }

    return {
      Area: area,
      Centroid: [sumX / area, sumY / area],
      MeanIntensity: sumI / area,
      MinIntensity: minI,
      MaxIntensity: maxI,
      XMin: round1(xMin), XMax: round1(xMax), YMin: round1(yMin), YMax: round1(yMax),
      Width: round1(xMax - xMin), Height: round1(yMax - yMin)
    };
  }

  function histStats(gray, x0, y0, x1, y1) {
    var hist = new Float64Array(256);
    var count = 0, sum = 0;
    for (var y = y0; y <= y1; y += 1) {
      var row = y * gray.w;
      for (var x = x0; x <= x1; x += 1) {
        var v = gray.data[row + x];
        hist[v] += 1; count += 1; sum += v;
      }
    }
    var mean = count ? sum / count : 0;
    var median = 0, mode = 0, best = -1, acc = 0, half = count / 2;
    var medianDone = false;
    for (var b = 0; b < 256; b += 1) {
      if (hist[b] > best) { best = hist[b]; mode = b; }
      acc += hist[b];
      if (!medianDone && acc >= half) { median = b; medianDone = true; }
    }
    return { mean: mean, median: median, mode: mode };
  }

  // A default top-strip background region (FishInspector recomputes this).
  function computeBackground(item, gray) {
    var param = { xoffset: 0.01, yoffset: 0.05, width: 0.98, height: 0.1 };
    var x0 = Math.round(param.xoffset * gray.w);
    var y0 = Math.round(param.yoffset * gray.h);
    var x1 = Math.min(gray.w - 1, Math.round((param.xoffset + param.width) * gray.w));
    var y1 = Math.min(gray.h - 1, Math.round((param.yoffset + param.height) * gray.h));
    var bg = histStats(gray, x0, y0, x1, y1);
    var full = histStats(gray, 0, 0, gray.w - 1, gray.h - 1);
    return {
      mode: "manual",
      parameter: param,
      medianBackgroundValue: bg.median,
      meanBackgroundValue: bg.mean,
      modeBackgroundValue: bg.mode,
      medianFullImage: full.median,
      meanFullImage: full.mean,
      modeFullImage: full.mode,
      shape: { name: "BackgroundRegion", x: [x0, x1], y: [y0, y1] }
    };
  }

  function buildFishInspector(item) {
    var gray = getGrayscale(item);
    var out = {
      version: FI_VERSION,
      enabled: 1,
      imageDimensions: [item.width, item.height, 3]
    };
    // Emit features in canonical order, stitching each into one contour.
    features.forEach(function (feature) {
      var arc = stitchedFeatureArc(item, feature.id);
      if (!arc) return;   // empty, or broken (handled by brokenFeatures on save)
      var xArr = arc.points.map(function (p) { return round1(p.x); });
      var yArr = arc.points.map(function (p) { return round1(p.y); });
      out[feature.id] = {
        mode: "manual",
        parameter: featureParameters[feature.id] || { disksize_CloseOpen: 0, min_peak_width: 0, contour_smoothing: 0.9 },
        shape: { name: "fineContour", x: xArr, y: yArr },
        regionprops: computeRegionProps(arc.points, gray)
      };
    });
    out.imageBackground = computeBackground(item, gray);
    return out;
  }

  // Stitch a feature's arcs; return the single closed contour, or null if broken.
  function stitchedFeatureArc(item, fid) {
    var arcs = featureArcs(item, fid).filter(function (a) { return a.points.length; });
    if (!arcs.length) return null;
    if (arcs.length === 1 && arcs[0].closed) return arcs[0];
    var stitched = geomStitch(arcs, fid, stitchTol(), false);
    return (stitched.length === 1 && stitched[0].closed) ? stitched[0] : null;
  }
  function brokenFeatures(item) {
    return features.filter(function (f) {
      return featureArcs(item, f.id).filter(function (a) { return a.points.length; }).length && !stitchedFeatureArc(item, f.id);
    });
  }

  function annotatedImages() {
    return state.images.filter(function (item) { return item.shapes.length > 0; });
  }

  function triggerDownload(blob, filename) {
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function downloadExport() {
    var item = activeImage();
    if (!item) { setLoadStatus("Load an image before saving.", true); return false; }
    var broken = brokenFeatures(item);
    if (broken.length) {
      broken.forEach(function (f) { stitchFeatureQuiet(item, f.id); });   // try once more within tolerance
      broken = brokenFeatures(item);
    }
    if (broken.length) {
      renderLists();
      setLoadStatus("Open contour in: " + broken.map(function (f) { return f.label; }).join(", ") + ". Connect the ends (or use \u201cJoin loose ends\u201d) before saving.", true);
      return false;
    }
    var json = JSON.stringify(buildFishInspector(item), null, 1);
    triggerDownload(new Blob([json], { type: "application/json" }), imageBasename(item.name) + "__SHAPES.json");
    item.dirty = false;
    updateDirtyBadge();
    renderImages();
    setLoadStatus("Saved " + imageBasename(item.name) + "__SHAPES.json to your downloads.", false);
    return true;
  }

  // ---- Minimal store-only ZIP writer (no dependencies, keeps the app offline)
  var crcTable = (function () {
    var table = new Uint32Array(256);
    for (var n = 0; n < 256; n += 1) {
      var c = n;
      for (var k = 0; k < 8; k += 1) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      table[n] = c >>> 0;
    }
    return table;
  })();

  function crc32(bytes) {
    var crc = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i += 1) crc = crcTable[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  function buildZip(entries) {
    var encoder = new TextEncoder();
    var chunks = [];
    var central = [];
    var offset = 0;

    function u16(v) { return [v & 0xFF, (v >>> 8) & 0xFF]; }
    function u32(v) { return [v & 0xFF, (v >>> 8) & 0xFF, (v >>> 16) & 0xFF, (v >>> 24) & 0xFF]; }

    entries.forEach(function (entry) {
      var nameBytes = encoder.encode(entry.name);
      var data = entry.data;
      var crc = crc32(data);
      var local = [].concat(
        u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0),
        u32(crc), u32(data.length), u32(data.length),
        u16(nameBytes.length), u16(0)
      );
      var localHeader = new Uint8Array(local);
      chunks.push(localHeader, nameBytes, data);

      var centralRecord = [].concat(
        u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0),
        u32(crc), u32(data.length), u32(data.length),
        u16(nameBytes.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset)
      );
      central.push({ header: new Uint8Array(centralRecord), name: nameBytes });
      offset += localHeader.length + nameBytes.length + data.length;
    });

    var centralStart = offset;
    var centralSize = 0;
    central.forEach(function (record) {
      chunks.push(record.header, record.name);
      centralSize += record.header.length + record.name.length;
    });

    var eocd = new Uint8Array([].concat(
      u32(0x06054b50), u16(0), u16(0), u16(entries.length), u16(entries.length),
      u32(centralSize), u32(centralStart), u16(0)
    ));
    chunks.push(eocd);

    var total = chunks.reduce(function (sum, c) { return sum + c.length; }, 0);
    var result = new Uint8Array(total);
    var pos = 0;
    chunks.forEach(function (c) { result.set(c, pos); pos += c.length; });
    return result;
  }
  // ---- tools ---------------------------------------------------------------

  function updateCanvasCursor() {
    if (state.shiftPan || state.showAll) { canvas.style.cursor = "grab"; return; }
    canvas.style.cursor = state.tool === "erase" ? "cell" : "crosshair";
  }

  // Second toolbar row: shown for Draw/Edit/Erase; Brush + Join only for Edit/Erase.
  function updateWorkRow2() {
    if (!appShell) return;
    var editing = !state.showAll && (state.tool === "draw" || state.tool === "edit" || state.tool === "erase");
    appShell.classList.toggle("show-row2", editing);
    appShell.classList.toggle("tool-brush", editing && (state.tool === "edit" || state.tool === "erase"));
    appShell.classList.toggle("tool-draw", editing && state.tool === "draw");
  }

  function setTool(tool) {
    state.tool = tool;
    document.querySelectorAll("[data-tool]").forEach(function (button) {
      button.classList.toggle("active", button.dataset.tool === tool);
    });
    updateWorkRow2();
    updateCanvasCursor();
    draw();   // refresh the brush circle on/off
  }

  // ---- pointer routing: pen draws, fingers navigate, palm is ignored -------

  function penActionActive() { return state.action && state.action.kind === "pen"; }

  function touchPointerIds() {
    var ids = [];
    state.pointers.forEach(function (p, id) { if (p.type === "touch") ids.push(id); });
    return ids;
  }

  function startPinch(ids) {
    var a = state.pointers.get(ids[0]);
    var b = state.pointers.get(ids[1]);
    if (!a || !b) return;
    state.pinch = {
      idA: ids[0], idB: ids[1],
      prevDist: Math.hypot(a.x - b.x, a.y - b.y),
      prevMidX: (a.x + b.x) / 2,
      prevMidY: (a.y + b.y) / 2
    };
  }

  function updatePinch() {
    var a = state.pointers.get(state.pinch.idA);
    var b = state.pointers.get(state.pinch.idB);
    if (!a || !b) { state.pinch = null; return; }
    var dist = Math.hypot(a.x - b.x, a.y - b.y);
    var midX = (a.x + b.x) / 2, midY = (a.y + b.y) / 2;
    if (state.pinch.prevDist > 0) {
      var rect = canvas.getBoundingClientRect();
      var before = screenToImage(state.pinch.prevMidX, state.pinch.prevMidY);
      state.scale = clampScale(state.scale * (dist / state.pinch.prevDist));
      state.offsetX = midX - rect.left - before.x * state.scale;
      state.offsetY = midY - rect.top - before.y * state.scale;
    }
    state.pinch.prevDist = dist;
    state.pinch.prevMidX = midX;
    state.pinch.prevMidY = midY;
    draw();
  }

  function extendStroke(e) {
    var events = (e.getCoalescedEvents && e.getCoalescedEvents()) || [];
    if (!events.length) events = [e];
    var changed = false;
    for (var i = 0; i < events.length; i += 1) {
      var pt = clampToImage(screenToImage(events[i].clientX, events[i].clientY));
      var last = state.currentStroke[state.currentStroke.length - 1];
      if (!last || distance(pt, last) >= 1.0) { state.currentStroke.push(pt); changed = true; }
    }
    if (changed) draw();
  }

  // ---- Edit push-brush -----------------------------------------------------

  function editRadiusImg() {
    var item = activeImage();
    var h = item && item.height ? item.height : 400;
    return Math.max(2, (state.editFraction * h) / 2);   // diameter fraction -> radius
  }

  // The brush acts like a disc pushing a string: points inside the circle are
  // pushed radially OUT to the rim (away from the brush centre) and never pulled
  // back in. Approach from one side to push that way; the other side to reverse.
  function pushBrush(e) {
    var item = activeImage();
    if (!item || !state.action) return;
    var arcs = featureArcs(item, state.action.feature);
    if (!arcs.length) return;
    var radius = editRadiusImg();
    var events = (e.getCoalescedEvents && e.getCoalescedEvents()) || [];
    if (!events.length) events = [e];
    for (var k = 0; k < events.length; k += 1) {
      var c = screenToImage(events[k].clientX, events[k].clientY);
      for (var a = 0; a < arcs.length; a += 1) {
        var pts = arcs[a].points;
        for (var i = 0; i < pts.length; i += 1) {
          var p = pts[i];
          var dx = p.x - c.x, dy = p.y - c.y;
          var d = Math.sqrt(dx * dx + dy * dy);
          if (d >= radius || d < 0.001) continue;
          var s = radius / d;
          p.x = Math.min(item.width, Math.max(0, c.x + dx * s));
          p.y = Math.min(item.height, Math.max(0, c.y + dy * s));
        }
      }
      state.action.last = c;
    }
    draw();
  }

  // Laplacian smoothing of interior points within the brush, endpoints fixed.
  function smoothRegion(shape, center, radius, lambda, iterations) {
    var n = shape.points.length;
    if (n < 3) return;
    for (var it = 0; it < iterations; it += 1) {
      var orig = shape.points.map(function (p) { return { x: p.x, y: p.y }; });
      for (var i = 1; i < n - 1; i += 1) {
        var d = Math.sqrt((orig[i].x - center.x) * (orig[i].x - center.x) + (orig[i].y - center.y) * (orig[i].y - center.y));
        if (d >= radius) continue;
        var a = orig[i - 1], b = orig[i + 1];
        shape.points[i].x = orig[i].x + lambda * ((a.x + b.x) / 2 - orig[i].x);
        shape.points[i].y = orig[i].y + lambda * ((a.y + b.y) / 2 - orig[i].y);
      }
    }
  }

  function updateCursor(clientX, clientY) {
    if (!activeImage()) { state.cursor = null; return; }
    state.cursor = screenToImage(clientX, clientY);
    if ((state.tool === "edit" || state.tool === "erase") && !state.showAll) draw(); else updateReadout();
  }

  canvas.addEventListener("pointerdown", function (e) {
    var item = activeImage();
    if (!item) return;
    var type = e.pointerType || "mouse";
    state.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, type: type });

    if (type === "touch") {
      // Pen always wins: any touch during a pen action (e.g. a resting palm)
      // is discarded rather than navigating the canvas.
      if (penActionActive()) { state.pointers.delete(e.pointerId); return; }
      try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
      var ids = touchPointerIds();
      if (ids.length >= 2) { state.touchPan = null; startPinch(ids); }
      else { state.pinch = null; state.touchPan = { pointerId: e.pointerId, lastX: e.clientX, lastY: e.clientY }; }
      return;
    }

    // pen or mouse -> tool action; a starting pen/mouse cancels touch navigation
    state.touchPan = null;
    state.pinch = null;
    try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
    var kind = type === "pen" ? "pen" : "mouse";
    // Review mode, or Shift/Alt/middle-button, pans for inspection.
    if (state.showAll || e.button === 1 || e.altKey || e.shiftKey) {
      state.action = { pointerId: e.pointerId, kind: kind, type: "pan", lastX: e.clientX, lastY: e.clientY };
      canvas.style.cursor = "grabbing";
      return;
    }
    // Draw/Edit/Erase act only on the image, not the dark margin around it.
    var downImg = screenToImage(e.clientX, e.clientY);
    if (!pointInImage(downImg, 6 / state.scale)) return;
    if (state.tool === "erase") {
      var fidE = activeFeature().id;
      if (!featureArcs(item, fidE).length) { setLoadStatus("Nothing to erase for " + activeFeature().label + ".", false); return; }
      state.action = { pointerId: e.pointerId, kind: kind, type: "erase", feature: fidE, before: snapshotFeature(item, fidE) };
      eraseBrush(e);
      return;
    }
    if (state.tool === "edit") {
      var fidE2 = activeFeature().id;
      if (!featureArcs(item, fidE2).length) { setLoadStatus("Draw or load the " + activeFeature().label + " outline before editing it.", false); return; }
      state.action = {
        pointerId: e.pointerId, kind: kind, type: "edit", feature: fidE2,
        before: snapshotFeature(item, fidE2),
        last: clampToImage(downImg)
      };
      return;
    }
    state.action = { pointerId: e.pointerId, kind: kind, type: "draw" };
    state.currentStroke = [clampToImage(downImg)];
    draw();
  });

  canvas.addEventListener("pointermove", function (e) {
    var p = state.pointers.get(e.pointerId);
    if (p) { p.x = e.clientX; p.y = e.clientY; }
    updateCursor(e.clientX, e.clientY);

    if (state.pinch) { updatePinch(); return; }
    if (state.touchPan && e.pointerId === state.touchPan.pointerId) {
      state.offsetX += e.clientX - state.touchPan.lastX;
      state.offsetY += e.clientY - state.touchPan.lastY;
      state.touchPan.lastX = e.clientX;
      state.touchPan.lastY = e.clientY;
      draw();
      return;
    }
    if (state.action && e.pointerId === state.action.pointerId) {
      if (state.action.type === "pan") {
        state.offsetX += e.clientX - state.action.lastX;
        state.offsetY += e.clientY - state.action.lastY;
        state.action.lastX = e.clientX;
        state.action.lastY = e.clientY;
        draw();
      } else if (state.action.type === "erase") {
        eraseBrush(e);
      } else if (state.action.type === "edit") {
        pushBrush(e);
      } else if (state.action.type === "draw" && state.currentStroke) {
        extendStroke(e);
      }
    }
  });

  function endPointer(e) {
    state.pointers.delete(e.pointerId);
    if (state.pinch && (e.pointerId === state.pinch.idA || e.pointerId === state.pinch.idB)) {
      state.pinch = null;
      var ids = touchPointerIds();
      if (ids.length >= 2) startPinch(ids);
      else if (ids.length === 1) {
        var only = state.pointers.get(ids[0]);
        state.touchPan = { pointerId: ids[0], lastX: only.x, lastY: only.y };
      }
    }
    if (state.touchPan && e.pointerId === state.touchPan.pointerId) state.touchPan = null;
    if (state.action && e.pointerId === state.action.pointerId) {
      if (state.action.type === "draw" && state.currentStroke) onDrawFinish(state.currentStroke);
      if (state.action.type === "edit" || state.action.type === "erase") {
        var item = activeImage();
        if (item) {
          if (state.action.type === "edit" && state.action.last) {
            featureArcs(item, state.action.feature).forEach(function (arc) {
              smoothRegion(arc, state.action.last, editRadiusImg() * 1.3, 0.35, 1);
            });
          }
          commitFeature(item, state.action.feature, state.action.before);
        }
      }
      state.currentStroke = null;
      state.action = null;
      updateCanvasCursor();
    }
    // On pen/touch there is no hover, so drop the brush circle when lifted.
    if (e.pointerType === "touch" || e.pointerType === "pen") { state.cursor = null; }
    try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}
    if (state.tool === "edit" || state.tool === "erase") draw();
  }
  canvas.addEventListener("pointerup", endPointer);
  canvas.addEventListener("pointercancel", endPointer);
  canvas.addEventListener("pointerleave", function () {
    if ((state.tool === "edit" || state.tool === "erase") && state.cursor) { state.cursor = null; draw(); }
  });

  canvas.addEventListener("wheel", function (e) {
    if (!activeImage()) return;
    e.preventDefault();
    zoomAbout(e.deltaY < 0 ? 1.1 : 1 / 1.1, e.clientX, e.clientY);
  }, { passive: false });

  // allow right-button drag as a push without popping the browser menu
  canvas.addEventListener("contextmenu", function (e) { e.preventDefault(); });

  // ---- toolbar / buttons ---------------------------------------------------

  document.querySelectorAll("[data-tool]").forEach(function (button) {
    button.addEventListener("click", function () {
      if (state.showAll) setShowAll(false);   // picking a tool resumes editing
      setTool(button.dataset.tool);
    });
  });
  if (allFeaturesBtn) allFeaturesBtn.addEventListener("click", function () { setShowAll(!state.showAll); });
  undoBtn.addEventListener("click", undo);
  clearFeatureBtn.addEventListener("click", clearActiveFeature);
  fitBtn.addEventListener("click", fitImage);
  zoomInBtn.addEventListener("click", function () { zoomCanvasCenter(1.25); });
  zoomOutBtn.addEventListener("click", function () { zoomCanvasCenter(1 / 1.25); });
  zoom100Btn.addEventListener("click", zoomToActual);
  exportBtn.addEventListener("click", downloadExport);
  if (editSize) editSize.addEventListener("input", function () {
    state.editFraction = Math.min(1 / 3, Math.max(0.01, Number(editSize.value) / 100));
    draw();
  });
  if (brightnessInput) brightnessInput.addEventListener("input", function () {
    state.brightness = Number(brightnessInput.value); draw();
  });
  if (contrastInput) contrastInput.addEventListener("input", function () {
    state.contrast = Number(contrastInput.value); draw();
  });
  if (viewReset) viewReset.addEventListener("click", function () {
    state.brightness = 100; state.contrast = 100;
    if (brightnessInput) brightnessInput.value = 100;
    if (contrastInput) contrastInput.value = 100;
    draw();
  });
  if (joinEndsBtn) joinEndsBtn.addEventListener("click", joinLooseEnds);
  if (flipBtn) flipBtn.addEventListener("click", flipActiveImage);
  if (sidebarToggle) sidebarToggle.addEventListener("click", function () {
    appShell.classList.toggle("sidebar-open");
  });

  // ---- help modal ----------------------------------------------------------
  var helpBtn = document.getElementById("helpBtn");
  var helpModal = document.getElementById("helpModal");
  var helpClose = document.getElementById("helpClose");
  var helpBackdrop = document.getElementById("helpBackdrop");
  function openHelp() { if (helpModal) helpModal.hidden = false; }
  function closeHelp() { if (helpModal) helpModal.hidden = true; }
  if (helpBtn) helpBtn.addEventListener("click", openHelp);
  if (helpClose) helpClose.addEventListener("click", closeHelp);
  if (helpBackdrop) helpBackdrop.addEventListener("click", closeHelp);

  // ---- file inputs ---------------------------------------------------------

  // On Chromium the File System Access picker remembers the last-used folder
  // across batches AND across restarts via the stable "id" below, and it is
  // file-selection only. Safari/Firefox fall back to the classic multi-select
  // input, where the starting folder is controlled by the OS.
  async function pickImages() {
    if (window.showOpenFilePicker) {
      try {
        var handles = await window.showOpenFilePicker({
          multiple: true,
          id: "fishAnnotatorImages",
          types: [{
            description: "Images and __SHAPES.json",
            accept: {
              "image/jpeg": [".jpg", ".jpeg"],
              "image/png": [".png"],
              "image/tiff": [".tif", ".tiff"],
              "image/bmp": [".bmp"],
              "image/webp": [".webp"],
              "image/gif": [".gif"],
              "application/json": [".json"]
            }
          }]
        });
        var files = [], handleMap = {};
        for (var i = 0; i < handles.length; i += 1) {
          var f = await handles[i].getFile();
          files.push(f);
          handleMap[f.name] = handles[i];
        }
        loadFiles(files, "picker", handleMap);
      } catch (err) {
        if (err && err.name === "AbortError") return;   // user cancelled
        imageInput.click();                              // fall back on any other error
      }
      return;
    }
    imageInput.click();
  }

  loadImagesBtn.addEventListener("click", pickImages);
  imageInput.addEventListener("change", function (e) { loadFiles(e.target.files, "images"); e.target.value = ""; });

  // Folder loading (Android Chrome / desktop; iPad Safari falls back to files).
  if (loadFolderBtn) loadFolderBtn.addEventListener("click", async function () {
    if (window.showDirectoryPicker) {
      try {
        var dir = await window.showDirectoryPicker({ id: "fishAnnotatorFolder" });
        var files = [], handleMap = {};
        for await (var entry of dir.values()) {
          if (entry.kind === "file") { var ff = await entry.getFile(); files.push(ff); handleMap[ff.name] = entry; }
        }
        loadFiles(files, "folder", handleMap);
      } catch (err) {
        if (err && err.name === "AbortError") return;
        folderInput.click();
      }
      return;
    }
    folderInput.click();
  });
  folderInput.addEventListener("change", function (e) { loadFiles(e.target.files, "folder"); e.target.value = ""; });

  // drag and drop (desktop)
  ["dragenter", "dragover"].forEach(function (name) {
    dropZone.addEventListener(name, function (e) { e.preventDefault(); dropZone.classList.add("drag-over"); });
  });
  ["dragleave", "drop"].forEach(function (name) {
    dropZone.addEventListener(name, function (e) { e.preventDefault(); dropZone.classList.remove("drag-over"); });
  });
  dropZone.addEventListener("drop", function (e) {
    loadFiles(e.dataTransfer ? e.dataTransfer.files : [], "drop");
  });

  // ---- keyboard ------------------------------------------------------------

  window.addEventListener("keydown", function (e) {
    if (e.key === "Shift" && !state.shiftPan) { state.shiftPan = true; updateCanvasCursor(); }
    if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) return;
    if (e.key === "Escape" && helpModal && !helpModal.hidden) { closeHelp(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); undo(); return; }
    if (e.key >= "1" && e.key <= "9") {
      var idx = Number(e.key) - 1;
      if (idx < features.length) setActiveFeature(features[idx].id);
      return;
    }
    switch (e.key.toLowerCase()) {
      case "d": if (state.showAll) setShowAll(false); setTool("draw"); break;
      case "e": if (state.showAll) setShowAll(false); setTool("erase"); break;
      case "g": if (state.showAll) setShowAll(false); setTool("edit"); break;
      case "a": setShowAll(!state.showAll); break;
      case "f": fitImage(); break;
      case "=": case "+": zoomCanvasCenter(1.25); break;
      case "-": zoomCanvasCenter(1 / 1.25); break;
    }
  });
  window.addEventListener("keyup", function (e) {
    if (e.key === "Shift") { state.shiftPan = false; updateCanvasCursor(); }
  });

  window.addEventListener("resize", resizeCanvas);
  window.addEventListener("error", function (e) { setLoadStatus("Script error: " + (e.message || "unknown"), true); });
  window.addEventListener("beforeunload", function (e) {
    var unsaved = state.images.some(function (im) { return im.dirty; });
    if (unsaved) { e.preventDefault(); e.returnValue = ""; }
  });

  // ---- init ----------------------------------------------------------------

  setTool("draw");
  applyReviewMode();
  renderLists();
  resizeCanvas();
  updateReadout();
  (idbAvailable() ? idbLoadAll() : Promise.resolve({})).then(function (map) {
    savedByName = map || {};
  }).catch(function () {});
})();
