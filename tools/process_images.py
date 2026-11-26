"""Prepare the LOGO files from assets/raw into src/assets/img (logo, logo-light, emblem, favicons).

This tool no longer touches photos: the site photos live in src/photos and are never overwritten
by any script. See "src/photos/READ ME - which photo goes where.txt".

Run from the repo root:  python tools/process_images.py --logo assets/raw/logo.png
  --logo PATH              logo source (transparent PNG, or a JPG on white)
  --logo-light PATH        optional ready-made light logo for dark backgrounds
  --emblem-cut FRACTION    fallback emblem height if the logo has no gap
"""
import argparse
from pathlib import Path
from PIL import Image, ImageOps, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "assets" / "raw"
OUT = ROOT / "src" / "assets" / "img"
OUT.mkdir(parents=True, exist_ok=True)

MAX_LOGO_W = 800
GOLD_ON_DARK = (236, 211, 171)  # --gold-3


def solid_bbox(im: Image.Image, thr: int = 40):
    return im.getchannel("A").point(lambda v: 255 if v > thr else 0).getbbox()


def key_white(im: Image.Image) -> Image.Image:
    """Cut a logo out of a white background (distance from white -> alpha)."""
    im = im.convert("RGB")
    w, h = im.size
    px = im.load()
    alpha = Image.new("L", im.size)
    a = alpha.load()
    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y]
            d = 255 - min(r, g, b)
            a[x, y] = 0 if d < 18 else min(255, (d - 18) * 4)
    alpha = alpha.filter(ImageFilter.GaussianBlur(0.6))
    rgba = im.copy()
    rgba.putalpha(alpha)
    return rgba


def load_logo(path: Path) -> Image.Image:
    im = Image.open(path)
    has_alpha = im.mode in ("RGBA", "LA") or (im.mode == "P" and "transparency" in im.info)
    if has_alpha:
        im = im.convert("RGBA")
        if im.getchannel("A").getextrema()[0] == 255:
            has_alpha = False  # alpha channel present but fully opaque
    rgba = im if has_alpha else key_white(im)
    rgba = rgba.crop(solid_bbox(rgba))
    if rgba.width > MAX_LOGO_W:
        rgba = rgba.resize((MAX_LOGO_W, round(rgba.height * MAX_LOGO_W / rgba.width)), Image.LANCZOS)
    return rgba


def lighten_wordmark(rgba: Image.Image) -> Image.Image:
    """Recolour dark, reddish pixels (the wine wordmark) to gold, keep alpha."""
    out = rgba.copy()
    px = out.load()
    # only the lettering below the emblem (the emblem's painting has dark reds of its own)
    solid = rgba.getchannel("A").point(lambda v: 255 if v > 40 else 0)
    gap = [y for y in range(int(rgba.height * 0.6), rgba.height)
           if solid.crop((0, y, rgba.width, y + 1)).getbbox() is None]
    start = gap[0] if gap else 0
    for y in range(start, out.height):
        for x in range(out.width):
            r, g, b, a = px[x, y]
            lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
            if a and lum < 0.35 and r > g * 1.3:
                px[x, y] = (*GOLD_ON_DARK, a)
    return out


def process_logo(src: Path, light_src: Path | None = None, emblem_cut: float | None = None):
    rgba = load_logo(src)
    rgba.save(OUT / "logo.png", optimize=True)
    if light_src and light_src.exists():
        light = load_logo(light_src)
        if light.size != rgba.size:
            light = light.resize(rgba.size, Image.LANCZOS)
    else:
        light = lighten_wordmark(rgba)
    light.save(OUT / "logo-light.png", optimize=True)
    # the emblem only (diamond), without the wordmark:
    # cut at the first fully transparent row below 60% of the height
    solid = rgba.getchannel("A").point(lambda v: 255 if v > 40 else 0)
    emblem_h = next((y for y in range(int(rgba.height * 0.6), rgba.height)
                     if solid.crop((0, y, rgba.width, y + 1)).getbbox() is None), None)
    if emblem_h is None:
        emblem_h = int(rgba.height * (emblem_cut or 0.62))
    emblem = rgba.crop((0, 0, rgba.width, emblem_h))
    emblem = emblem.crop(solid_bbox(emblem))
    emblem.save(OUT / "emblem.png", optimize=True)
    # favicons: the emblem on a square transparent canvas
    side = max(emblem.size)
    sq = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    sq.paste(emblem, ((side - emblem.width) // 2, (side - emblem.height) // 2))
    sq.resize((256, 256), Image.LANCZOS).save(OUT / "favicon.png", optimize=True)
    sq.resize((32, 32), Image.LANCZOS).save(OUT / "favicon-32.png", optimize=True)
    print("logo", rgba.size, "logo-light", light.size, "emblem", emblem.size)


def default_logo() -> Path:
    for name in ("logo.png", "logo-new.png", "3.jpg"):
        if (RAW / name).exists():
            return RAW / name
    raise SystemExit("no logo found in assets/raw")


def default_light(logo: Path) -> Path | None:
    cand = logo.with_name(logo.stem + "-light.png")
    return cand if cand.exists() else None


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--logo", type=Path, help="logo source (default: assets/raw/logo.png)")
    ap.add_argument("--logo-light", type=Path)
    ap.add_argument("--emblem-cut", type=float)
    args = ap.parse_args()
    logo = args.logo or default_logo()
    process_logo(logo, args.logo_light or default_light(logo), args.emblem_cut)
