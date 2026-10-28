#!/usr/bin/env python3
"""Extract embedded texture images from a Meshy .meshy container file."""
import io
import os
import re
import sys

from PIL import Image

SRC = sys.argv[1] if len(sys.argv) > 1 else "/home/z/my-project/download/tavern_model.meshy"
OUT_DIR = sys.argv[2] if len(sys.argv) > 2 else "/home/z/my-project/download/tavern_textures"

data = open(SRC, "rb").read()
n = len(data)
os.makedirs(OUT_DIR, exist_ok=True)

results = []

# --- WEBP (RIFF) exact extraction: size is in bytes 4..8 ---
for m in re.finditer(rb"RIFF", data):
    pos = m.start()
    if pos + 8 <= n:
        size = int.from_bytes(data[pos + 4 : pos + 8], "little") + 8
        if 0 < size <= n - pos:
            blob = data[pos : pos + size]
            try:
                img = Image.open(io.BytesIO(blob))
                img.load()
                results.append((pos, blob, img))
            except Exception:
                pass

# --- JPEG carving with PIL validation: keep longest valid decode per start ---
jpeg_starts = [m.start() for m in re.finditer(rb"\xff\xd8\xff", data)]
end_candidates = [m.start() for m in re.finditer(rb"\xff\xd9", data)]

for start in jpeg_starts:
    best = None
    for end in end_candidates:
        if end <= start + 100:
            continue
        if end - start > 20_000_000:
            break
        blob = data[start : end + 2]
        try:
            img = Image.open(io.BytesIO(blob))
            img.load()
            best = (blob, img)  # keep extending: longest valid wins
        except Exception:
            continue
    if best:
        blob, img = best
        results.append((start, blob, img))

# Deduplicate by start offset, sort by position
seen = set()
final = []
for pos, blob, img in sorted(results, key=lambda r: r[0]):
    if pos in seen:
        continue
    seen.add(pos)
    final.append((pos, blob, img))

print(f"Found {len(final)} valid images:")
for i, (pos, blob, img) in enumerate(final):
    w, h = img.size
    fmt = img.format.lower()
    ext = "webp" if fmt == "webp" else "jpg"
    name = f"texture_{i:02d}_{w}x{h}_{fmt}.{ext}"
    path = os.path.join(OUT_DIR, name)
    with open(path, "wb") as f:
        f.write(blob)
    print(f"  offset={pos:>10}  {w}x{h}  {fmt}  size={len(blob):>10}  -> {name}")
