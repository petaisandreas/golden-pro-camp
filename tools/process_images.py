"""Prepare site images from assets/raw into src/assets/img.

Photos get the warm sepia duotone used on the Golden banners.
Run from the repo root:  python tools/process_images.py
"""
from pathlib import Path
from PIL import Image, ImageOps, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "assets" / "raw"
OUT = ROOT / "src" / "assets" / "img"
OUT.mkdir(parents=True, exist_ok=True)

DARK = (34, 20, 16)
MID = (140, 104, 84)
LIGHT = (246, 236, 226)

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


def process_logo():
    """Cut the gold logo out of its white background."""
    im = Image.open(RAW / "3.jpg").convert("RGB")
    w, h = im.size
    # distance from white -> alpha, so soft edges stay soft
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
    bbox = alpha.point(lambda v: 255 if v > 40 else 0).getbbox()
    rgba = rgba.crop(bbox)
    rgba.save(OUT / "logo.png", optimize=True)
    # the emblem only (diamond + ribbon), without the wordmark
    # cut at the first transparent row below the emblem so the ribbon stays whole
    solid = rgba.getchannel("A").point(lambda v: 255 if v > 40 else 0)
    emblem_h = next(y for y in range(int(rgba.height * 0.6), rgba.height)
                    if solid.crop((0, y, rgba.width, y + 1)).getbbox() is None)
    emblem = rgba.crop((0, 0, rgba.width, emblem_h))
    emblem = emblem.crop(emblem.getchannel("A").point(lambda v: 255 if v > 40 else 0).getbbox())
    emblem.save(OUT / "emblem.png", optimize=True)
    # favicon
    fav = emblem.copy()
    fav.thumbnail((256, 256), Image.LANCZOS)
    fav.save(OUT / "favicon.png")
    print("logo", rgba.size, "emblem", emblem.size)


if __name__ == "__main__":
    process_photos()
    process_logo()
