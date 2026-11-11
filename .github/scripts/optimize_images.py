"""Shrink oversized photos in public/assets/ so the live site stays fast.

Runs from .github/workflows/optimize-images.yml whenever images change.
A photo is processed only if it is wider/taller than MAX_SIDE or bigger
than MAX_BYTES. It is resized, compressed, and saved under the SAME
filename, so content that points to it keeps working.
"""
import os
import sys
from pathlib import Path

from PIL import Image, ImageOps

MAX_SIDE = 1600          # px, longest side
MAX_BYTES = 500 * 1024   # leave smaller files alone
JPEG_QUALITY = 82
WEBP_QUALITY = 80
FOLDER = Path("public/assets")
# Design artwork built at its exact size. Never touch these.
SKIP = {"florals-field.webp", "thrive-wordmark-blue.png", "thrive-wordmark-white.png", "flower.png", "floral-corner-l.webp", "floral-corner-r.webp", "og-image.jpg", "promo-square.webp", "favicon.png", "apple-touch-icon.png"}


def optimize(path: Path) -> bool:
    before = path.stat().st_size
    with Image.open(path) as im:
        if max(im.size) <= MAX_SIDE and before <= MAX_BYTES:
            return False
        im = ImageOps.exif_transpose(im)          # keep phone photos upright
        im.thumbnail((MAX_SIDE, MAX_SIDE), Image.LANCZOS)
        ext = path.suffix.lower()
        tmp = path.with_name(path.name + ".tmp")
        if ext in (".jpg", ".jpeg"):
            im.convert("RGB").save(tmp, "JPEG", quality=JPEG_QUALITY, optimize=True, progressive=True)
        elif ext == ".webp":
            im.save(tmp, "WEBP", quality=WEBP_QUALITY, method=6)
        elif ext == ".png":
            im.save(tmp, "PNG", optimize=True)
        else:
            return False
    after = tmp.stat().st_size
    if after >= before and max(Image.open(tmp).size) >= max(Image.open(path).size):
        tmp.unlink()                               # no gain, keep original
        return False
    os.replace(tmp, path)
    print(f"{path}: {before // 1024} KB -> {after // 1024} KB")
    return True


def main() -> int:
    changed = [optimize(p) for p in sorted(p for p in FOLDER.rglob("*") if p.is_file() and p.name not in SKIP)
               if p.suffix.lower() in (".jpg", ".jpeg", ".png", ".webp")]
    print(f"Optimized {sum(changed)} of {len(changed)} images.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
