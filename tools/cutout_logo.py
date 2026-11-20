"""Cut the client's cleaner logo (assets/raw/logo_cleaner.webp, painted on a cream/rose background)
out to a transparent PNG at assets/raw/logo-clean.png, which process_images.py --logo then uses.

Emblem: the diamond is cut as a polygon (its painting has background colours in it, so colour keying
would eat holes), and the belts that stick out over the cream are keyed against the cream.
Lettering (below the emblem): alpha from how far each pixel is from the cream, so the letter
counters (O, D, R, P) become transparent and the edges stay smooth.
Run from the repo root:  python tools/cutout_logo.py
"""
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "assets" / "raw" / "logo_cleaner.webp"
OUT = ROOT / "assets" / "raw" / "logo-clean.png"

im = Image.open(SRC).convert("RGB")
a = np.asarray(im).astype(np.int32)
h, w, _ = a.shape

# emblem = the diamond (drawn as a polygon, so the painting inside stays whole) plus the two belts,
# which stick out over plain cream and are keyed against it. The rose/blush shapes behind are dropped.
y0 = 722  # first row of the lettering
DIAMOND = [(499, 26), (861, 385), (499, 716), (137, 388)]
S = 4
poly = Image.new("L", (w * S, h * S), 0)
ImageDraw.Draw(poly).polygon([(x * S, y * S) for x, y in DIAMOND], fill=255)
poly = np.asarray(poly.resize((w, h), Image.LANCZOS)).astype(np.float32)

cream = np.array((239, 228, 213))
blush = np.array((230, 205, 193))
d_bg = np.minimum(np.linalg.norm(a - cream, axis=2), np.linalg.norm(a - blush, axis=2))
zone = np.zeros((h, w), bool)
zone[465:y0, 190:810] = True  # the belts' band, clear of the rose shapes at the far left
# solid belts: key against the cream, then close the shiny highlights so they don't turn see-through
belts = Image.fromarray(np.where(zone & (d_bg > 22), 255, 0).astype(np.uint8))
belts = belts.filter(ImageFilter.MaxFilter(9)).filter(ImageFilter.MinFilter(9)).filter(ImageFilter.MinFilter(3))
belts = np.asarray(belts.filter(ImageFilter.GaussianBlur(0.9))).astype(np.float32)

emblem = np.maximum(poly, belts)
emblem[y0:] = 0
emblem_a = Image.fromarray(emblem.astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.5))

# lettering: distance from the cream, mapped to alpha
d = np.linalg.norm(a[y0:] - cream, axis=2)
text_a = np.clip((d - 30) * 255 / 110, 0, 255).astype(np.uint8)

final_a = np.asarray(emblem_a).copy()
final_a[y0:] = text_a
rgba = np.dstack([a.astype(np.uint8), final_a])
# un-mix the cream from semi-transparent lettering edges so they don't halo on dark backgrounds
t = rgba[y0:, :, :3].astype(np.float32)
al = (text_a.astype(np.float32) / 255)[..., None]
un = np.where(al > 0.02, (t - cream * (1 - al)) / np.maximum(al, 0.02), t)
rgba[y0:, :, :3] = np.clip(un, 0, 255).astype(np.uint8)

out = Image.fromarray(rgba, "RGBA")
out = out.crop(out.getchannel("A").point(lambda v: 255 if v > 30 else 0).getbbox())
out.save(OUT)
print("wordmark starts at", y0, "->", OUT.name, out.size)
