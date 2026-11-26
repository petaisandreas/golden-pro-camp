"""Make photos safe and light for the web.

  python tools/optimize_photos.py dist/photos            shrink + strip the PUBLISHED copies (deploy workflow)
  python tools/optimize_photos.py --clean src/photos     strip hidden data from the originals before publishing
  python tools/optimize_photos.py --check src/photos     fail if any photo still carries hidden data

Shrinking: longest side at most 2400 px, web JPEG quality, progressive.
Stripping: ALL metadata is removed (EXIF incl. GPS location, XMP, IPTC, comments, camera ICC
profile); the EXIF rotation is applied first so phone photos stay upright. Every written file is
re-opened and checked, and the script exits with an error if anything is left, so a photo that
could not be cleaned is never published.
"""
import sys
from pathlib import Path
from PIL import Image, ImageOps

MAX_SIDE = 2400
QUALITY = 82
EXTS = (".jpg", ".jpeg", ".png", ".webp")
# keys in Image.info that can carry personal data (location, device, names, edit history)
RISKY_INFO = ("exif", "xmp", "XML:com.adobe.xmp", "comment", "icc_profile", "photoshop", "iptc")


def hidden_data(path: Path) -> list:
    """What personal/hidden data is still in the file (empty list = clean)."""
    with Image.open(path) as im:
        found = [k for k in RISKY_INFO if im.info.get(k)]
        if len(im.getexif()):
            found.append("EXIF tags")
        # PNG text chunks (tEXt/iTXt/zTXt) land in info as plain strings
        found += [k for k, v in im.info.items() if isinstance(v, str) and k not in RISKY_INFO]
    return found


def rewrite(path: Path, shrink: bool) -> None:
    ext = path.suffix.lower()
    with Image.open(path) as src:
        im = ImageOps.exif_transpose(src)  # upright first
        if shrink and max(im.size) > MAX_SIDE:
            im.thumbnail((MAX_SIDE, MAX_SIDE), Image.LANCZOS)
        im.load()
        im.info = {}  # drop everything the source carried
        if ext in (".jpg", ".jpeg"):
            im.convert("RGB").save(path, "JPEG", quality=QUALITY if shrink else 92, optimize=True,
                                   progressive=True, exif=b"", comment=b"")
        elif ext == ".png":
            im.save(path, "PNG", optimize=True)
        elif ext == ".webp":
            im.save(path, "WEBP", quality=QUALITY if shrink else 92, method=6, exif=b"")
    left = hidden_data(path)
    if left:
        raise SystemExit(f"Could not remove hidden data from {path}: {', '.join(left)}")
    print("cleaned" if not shrink else "optimised", path)


def photos(root: Path):
    if not root.is_dir():
        raise SystemExit(f"{root} not found")
    return [p for p in sorted(root.rglob("*")) if p.is_file() and p.suffix.lower() in EXTS]


def main() -> None:
    args = sys.argv[1:]
    mode = args.pop(0) if args and args[0].startswith("--") else "--publish"
    root = Path(args[0] if args else "dist/photos")
    if mode == "--check":
        bad = [(p, hidden_data(p)) for p in photos(root)]
        bad = [(p, d) for p, d in bad if d]
        for p, d in bad:
            print(f"HIDDEN DATA in {p}: {', '.join(d)}")
        if bad:
            raise SystemExit("Some photos still carry hidden data (location/camera). Run: "
                             f"python tools/optimize_photos.py --clean {root}")
        print(f"{root}: all photos clean")
    elif mode == "--clean":
        for p in photos(root):
            if hidden_data(p):
                rewrite(p, shrink=False)
    elif mode == "--publish":
        for p in photos(root):
            rewrite(p, shrink=True)
    else:
        raise SystemExit(f"unknown option {mode}")


if __name__ == "__main__":
    main()
