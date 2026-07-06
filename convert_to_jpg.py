#!/usr/bin/env python3
"""Convert microscopy TIFFs to same-dimension grayscale JPEGs for annotation.

The annotation tool draws in pixel coordinates, so the JPEG must keep the
EXACT pixel dimensions of the original TIFF -- only the file format changes.
Coordinates traced on the JPEG then map straight back onto the original TIFF
for FishInspector's measurement run.

Usage:
    python convert_to_jpg.py INPUT_DIR OUTPUT_DIR [--quality 90] [--no-stretch]

Requires: pillow, tifffile, numpy
    pip install pillow tifffile numpy
"""
import argparse
import pathlib
import sys

import numpy as np
from PIL import Image

try:
    import tifffile
except ImportError:
    tifffile = None

TIFF_EXT = {".tif", ".tiff"}


def to_8bit_gray(arr, stretch):
    """Return an 8-bit single-channel array, same H x W as the input."""
    if arr.ndim == 3:
        # collapse channels to luminance; brightfield is effectively gray
        if arr.shape[2] >= 3:
            arr = (0.299 * arr[..., 0] + 0.587 * arr[..., 1] + 0.114 * arr[..., 2])
        else:
            arr = arr[..., 0]
    arr = arr.astype(np.float64)
    if stretch:
        lo, hi = np.percentile(arr, (2, 98))
        if hi <= lo:
            lo, hi = arr.min(), max(arr.max(), arr.min() + 1)
        arr = (arr - lo) / (hi - lo)
    else:
        peak = arr.max() if arr.max() > 0 else 1.0
        arr = arr / peak
    arr = np.clip(arr * 255.0, 0, 255)
    return arr.astype(np.uint8)


def load_tiff(path):
    if tifffile is not None:
        return np.asarray(tifffile.imread(str(path)))
    return np.asarray(Image.open(path))


def convert(in_dir, out_dir, quality, stretch):
    in_dir = pathlib.Path(in_dir)
    out_dir = pathlib.Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    files = sorted(p for p in in_dir.iterdir() if p.suffix.lower() in TIFF_EXT)
    if not files:
        print("No .tif/.tiff files found in", in_dir)
        return
    done = 0
    for path in files:
        try:
            arr = load_tiff(path)
            if arr.ndim > 3:  # take first plane of a stack
                arr = arr[0]
            gray = to_8bit_gray(arr, stretch)
            out_path = out_dir / (path.stem + ".jpg")
            Image.fromarray(gray, mode="L").save(out_path, "JPEG", quality=quality)
            done += 1
            print(f"  {path.name}  ->  {out_path.name}  ({gray.shape[1]}x{gray.shape[0]} px)")
        except Exception as exc:  # noqa: BLE001
            print(f"  FAILED {path.name}: {exc}", file=sys.stderr)
    print(f"Converted {done}/{len(files)} images (quality={quality}, "
          f"{'stretched' if stretch else 'no stretch'}, grayscale).")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="TIFF -> same-size grayscale JPEG")
    ap.add_argument("input_dir")
    ap.add_argument("output_dir")
    ap.add_argument("--quality", type=int, default=90,
                    help="JPEG quality 1-100 (default 90; keep >=85 for clean edges)")
    ap.add_argument("--no-stretch", action="store_true",
                    help="skip the 2-98%% contrast stretch used to make faint fish visible")
    args = ap.parse_args()
    convert(args.input_dir, args.output_dir, args.quality, not args.no_stretch)
