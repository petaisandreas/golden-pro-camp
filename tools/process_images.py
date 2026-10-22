"""Prepare site images from assets/raw into src/assets/img.

Photos get the warm sepia duotone used on the Golden banners.
Run from the repo root:  python tools/process_images.py
  --photos-only            only re-tone the photos
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

# warm, nearly neutral black-and-white (mockup samples #0a0907 / #3e342b / #aa998f)
DARK = (14, 11, 10)
MID = (118, 104, 94)
LIGHT = (240, 231, 223)

# output name -> (raw file, crop box as fractions (l, t, r, b) or None, max width)
PHOTOS = {
    "hero-1": ("ig-03.jpg", None, 2400),
    "hero-2": ("ig-12.jpg", None, 2400),
    "hero-3": ("ig-18.jpg", None, 2400),
    "hero-4": ("ig-05.jpg", None, 2400),
    "environment": ("ig-14.jpg", None, 2000),
    "show": ("ig-08.jpg", None, 2000),
    "show-detail": ("ig-09.jpg", (0.5, 0.0, 1.0, 1.0), 1400),
    "community": ("ig-19.jpg", None, 2000),
    "community-joy": ("ig-01.jpg", None, 2000),
    "what-is-golden": ("ig-10.jpg", None, 2000),
    "who-is-golden": ("ig-11.jpg", None, 1600),
    "join": ("ig-06.jpg", None, 2000),
    "apply": ("ig-15.jpg", None, 1600),
    "eleftheria": ("ig-eleftheria.jpg", (0.42, 0.13, 1.0, 1.0), 1200),
}


def clean_eleftheria_poster(im: Image.Image) -> Image.Image:
    """Paint over the poster lettering left of her hair with the background
    colour sampled from the clean strip between the text and the hair."""
    w, h = im.size
    s = w / 1440
    x0, x1, sample_x, y_end = int(600 * s), int(858 * s), int(866 * s), int(700 * s)
    px = im.load()
    for y in range(y_end):
        c = px[sample_x, y]
        for x in range(x0, x1):
            px[x, y] = c
    # soften the painted block so it reads as a glow, not a band
    box = (x0, 0, x1 + int(10 * s), y_end + int(20 * s))
    im.paste(im.crop(box).filter(ImageFilter.GaussianBlur(14 * s)), box[:2])
    return im


def trim_white_border(im: Image.Image) -> Image.Image:
    """Some Instagram exports are letterboxed on white; cut that frame off."""
    g = ImageOps.grayscale(im).point(lambda v: 255 if v < 235 else 0)
    bbox = g.getbbox()
    if not bbox:
        return im
    l, t, r, b = bbox
    inset = 6  # skip anti-aliased edge pixels
    return im.crop((l + inset, t + inset, r - inset, b - inset))


def sepia(im: Image.Image) -> Image.Image:
    g = ImageOps.grayscale(im)
    g = ImageOps.autocontrast(g, cutoff=0.5)
    g = g.point(lambda v: int(v * 0.94 + 6))  # highlights land on paper, not white
    return ImageOps.colorize(g, black=DARK, mid=MID, white=LIGHT)


def process_photos():
    for name, (src, crop, max_w) in PHOTOS.items():
        im = Image.open(RAW / src).convert("RGB")
        if name == "eleftheria":
            im = clean_eleftheria_poster(im)
        else:
            im = trim_white_border(im)
        if crop:
            w, h = im.size
            im = im.crop((int(crop[0] * w), int(crop[1] * h), int(crop[2] * w), int(crop[3] * h)))
        if im.width > max_w:
            im = im.resize((max_w, round(im.height * max_w / im.width)), Image.LANCZOS)
        sepia(im).save(OUT / f"{name}.jpg", quality=80, optimize=True, progressive=True)
        print("photo", name, im.size)


MAX_LOGO_W = 700
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
    for y in range(out.height):
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
    ap.add_argument("--photos-only", action="store_true")
    ap.add_argument("--logo", type=Path, help="logo source; skips photos unless --with-photos")
    ap.add_argument("--logo-light", type=Path)
    ap.add_argument("--emblem-cut", type=float)
    ap.add_argument("--with-photos", action="store_true")
    args = ap.parse_args()
    if not args.logo or args.with_photos or args.photos_only:
        process_photos()
    if not args.photos_only:
        logo = args.logo or default_logo()
        process_logo(logo, args.logo_light or default_light(logo), args.emblem_cut)
