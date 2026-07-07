# Fish Annotator

A lightweight, offline web tool for **manually annotating and correcting anatomical outlines ("masks") on zebrafish images** and exporting them as [FishInspector](https://github.com/sscholz-UFZ/FishInspector)-compatible `__SHAPES.json` files.

It is designed for pen-on-tablet use (Apple Pencil, S-Pen, etc.) as well as mouse, and runs entirely in the browser — no server, no account, no installation.

---

## What it does

- Draw outlines for the standard FishInspector features: **body contour, eye, notochord, pericard, mouth tip, otolith, placode, swim bladder, yolk sac**.
- **Edit** existing masks with a push-brush that shoves a contour into place, and **erase** parts of an outline with a brush (masks loaded from an existing `__SHAPES.json`).
- Adjust on-screen **brightness/contrast** to see faint edges (view only — the image file is never changed).
- Export one `<image>__SHAPES.json` per image, ready for analysis in FishInspector.

### Tools

| Tool | Purpose |
|------|---------|
| **Flip ⇕** | Mirror the image top-to-bottom and save it. Only before annotating an image that has no JSON (greyed out once a feature is drawn or a JSON is loaded). Overwrites the original file in place where the browser allows (Android/desktop Chrome, ChromeOS — usually via **Load folder**); otherwise downloads the flipped JPG to replace the original. You then annotate the flipped image. |
| **Draw** | Trace an outline in as many strokes as you like. Each stroke is a piece; starting a new stroke near a loose end welds it on (overshoot trimmed, joint smoothed). Reposition between strokes; when the last piece meets the first, the loop closes (green). |
| **Edit** | Push an existing outline into place with a circular brush — the line is shoved out of the circle, away from the brush. Push from one side to move it that way; the other side to push it back. Brush size adjustable (1/100–1/3 of image height). |
| **Erase** | A brush that *cuts* the active outline where you touch it, opening a real gap so you can redraw that part. |
| **Join loose ends** | Connects any remaining open ends of the active feature by nearest distance, closing the contour (second toolbar row, during Draw). |
| **Clear** | Remove the whole active feature's outline at once. |
| **Move / zoom** | Touch: two fingers move the image, pinch to zoom (one finger / pen draws). Computer: hold **Shift** and drag to move; mouse wheel or the −/100%/+/Fit buttons to zoom. |
| **All features** | Review mode: shows every outline at once (editing paused). |
| **Feature tiles** | Pick the active feature. Dot: red = empty, amber = open contour (has a gap), green = one closed loop. Small gaps auto-join on feature-switch / All features / save; a remaining gap blocks saving that feature. |
| **Second toolbar row** | Appears for Draw/Edit/Erase. Always shows **Image view** (Brightness / Contrast, view-only); Draw also shows Join loose ends; Edit/Erase show Brush size. |
| **Save active JSON** | Writes `<image>__SHAPES.json`. Broken (open) contours block the save until connected. In-progress work is kept in the browser so re-opening an image resumes it; switching images with unsaved changes asks whether to save first. |

In-progress work (including half-drawn outlines) is kept in the browser, so re-opening the same image later resumes where you left off — but only **Save active JSON** produces the file for FishInspector. Switching images with unsaved changes prompts you to save first. A built-in **Help** panel explains everything, including device-specific file handling.

---

## Running the annotator

No installation is required. Either:

- **Double-click `index.html`** to open it in any modern browser (Chrome, Edge, Safari, Firefox), or
- Host the folder (`index.html`, `app.js`, `styles.css`) on any static web server / GitHub Pages.

It works on desktops and tablets (iPadOS, Android, Fire OS, Windows, ChromeOS). Landscape orientation is recommended.

### Loading & saving

- Keep each image and its `<image name>__SHAPES.json` in the **same folder**. Load them together and they pair automatically by name (matching is tolerant of spaces, underscores, and `.ome`/`.tif` differences).
- **Load images + JSON** selects specific files; **Load folder** loads a whole folder (Android Chrome / desktop).
- **Save active JSON** downloads the file. On most devices it lands in *Downloads* — move it back into your image folder afterwards. (Browsers cannot write directly into a cloud/USB folder, except Android Chrome / desktop.)

---

## Preparing images: convert TIFF → JPG

Microscopes usually save **TIFF**, but the annotator runs fastest on **JPG**. Convert your images first with the included `convert_to_jpg.py` script. It **preserves the exact pixel dimensions** of the original, which is essential — the annotation coordinates must match the original image (and the TIFF) for FishInspector.

> Run the conversion on a **PC/Mac**, not the tablet. Keep the original TIFFs; the JPGs are only for annotating. When done, place the exported `__SHAPES.json` files in the same folder as the original TIFFs and open them in FishInspector.

### Requirements

- **Python 3** (from [python.org](https://www.python.org/downloads/) — on Windows tick *"Add Python to PATH"* during install)
- Three Python libraries:

```
pip install pillow tifffile numpy
```

### Usage (command line)

```
python convert_to_jpg.py INPUT_FOLDER OUTPUT_FOLDER [--quality 95] [--no-stretch]
```

| Argument | Meaning |
|----------|---------|
| `INPUT_FOLDER` | Folder containing `.tif` / `.tiff` images. |
| `OUTPUT_FOLDER` | Where the `.jpg` files are written (created if it doesn't exist). |
| `--quality` | JPEG quality, 1–100. Default **95**. Keep ≥ 85 for clean edges. |
| `--no-stretch` | Skip the 2–98 % contrast stretch (which makes faint fish more visible). |

Defaults: **quality 95, grayscale, same pixel size**, with a gentle contrast stretch.

#### Examples

**Windows (Command Prompt):**
```
cd path\to\fish-annotator
python convert_to_jpg.py "C:\data\tiffs" "C:\data\jpgs"
```

**macOS / Linux (Terminal):**
```
cd path/to/fish-annotator
python3 convert_to_jpg.py ~/data/tiffs ~/data/jpgs --quality 92
```

Each converted file is reported with its pixel size, e.g.:

```
  ZF211029GANN01_A.tif  ->  ZF211029GANN01_A.jpg  (1285x274 px)
Converted 48/48 images (quality=95, stretched, grayscale).
```

> Note: the converter handles uncompressed and PackBits TIFFs (via Pillow/tifffile). Most microscope TIFFs are supported.

---

## Typical workflow

1. Convert TIFFs → JPGs on a computer (`convert_to_jpg.py`).
2. Open the JPG (and its `__SHAPES.json`, if it exists) in Fish Annotator.
3. Draw or **Edit** each feature; check every feature dot is green.
4. **Save active JSON**.
5. Put the saved `__SHAPES.json` in the folder with the original **TIFF** and open it in **FishInspector** for analysis.

### Fixing a wrongly-placed section of a contour

1. Select the feature and pick **Erase**; brush over the bad section to open a gap (the dot turns amber).
2. Pick **Draw** and trace the correct section, starting near one loose end and finishing near the other — it welds into the line.
3. If a small gap remains, press **Join loose ends** (Adjust row). The dot returns to green and the contour saves as one continuous loop.

---

## Files

| File | Description |
|------|-------------|
| `index.html` | The app entry point — open this in a browser. |
| `app.js` | Application logic (vanilla JS, no dependencies). |
| `styles.css` | Styling. |
| `convert_to_jpg.py` | TIFF → JPG batch converter (run on a computer). |

---

## Notes & limitations

- Saving writes to *Downloads* on most devices; direct folder saving is only available in Android Chrome / desktop.
- Folder loading is not available on iPad Safari — select files instead.
- The in-browser TIFF viewer supports uncompressed and PackBits TIFFs; converting to JPG first avoids any TIFF-compression issues and is faster.
