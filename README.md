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
| **Draw** | Trace a feature's outline (one outline per feature; drawing again replaces it). |
| **Edit** | Push an existing outline into place with a circular brush — the line is shoved out of the circle, away from the brush. Push from one side to move it that way; the other side to push it back. Brush size adjustable (1/100–1/3 of image height). |
| **Erase** | A brush that removes only the parts of the *active* feature's outline it touches (size set by the Brush slider). |
| **Clear** | Remove the whole active feature's outline at once. |
| **Pan / pinch** | One finger pans, two fingers zoom; the pen always draws. |
| **All features** | Review mode: shows every outline at once (editing paused). |
| **Feature tiles** | Pick the active feature. A red dot = not annotated, green dot = annotated. |
| **Image view** | Brightness / Contrast sliders adjust the on-screen view only — the image file is not changed. |
| **Save active JSON** | Writes `<image>__SHAPES.json`. An "Unsaved JSON" flag shows pending changes. |

Work autosaves in the browser (IndexedDB) so annotations survive an accidental reload. A built-in **Help** panel explains everything, including device-specific file handling.

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
python convert_to_jpg.py INPUT_FOLDER OUTPUT_FOLDER [--quality 90] [--no-stretch]
```

| Argument | Meaning |
|----------|---------|
| `INPUT_FOLDER` | Folder containing `.tif` / `.tiff` images. |
| `OUTPUT_FOLDER` | Where the `.jpg` files are written (created if it doesn't exist). |
| `--quality` | JPEG quality, 1–100. Default **90**. Keep ≥ 85 for clean edges. |
| `--no-stretch` | Skip the 2–98 % contrast stretch (which makes faint fish more visible). |

Defaults: **quality 90, grayscale, same pixel size**, with a gentle contrast stretch.

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
Converted 48/48 images (quality=90, stretched, grayscale).
```

> Note: the converter handles uncompressed and PackBits TIFFs (via Pillow/tifffile). Most microscope TIFFs are supported.

---

## Typical workflow

1. Convert TIFFs → JPGs on a computer (`convert_to_jpg.py`).
2. Open the JPG (and its `__SHAPES.json`, if it exists) in Fish Annotator.
3. Draw or **Edit** each feature; check every feature dot is green.
4. **Save active JSON**.
5. Put the saved `__SHAPES.json` in the folder with the original **TIFF** and open it in **FishInspector** for analysis.

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
