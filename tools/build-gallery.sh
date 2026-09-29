#!/bin/bash
# Build img/gallery/thumbs/ from the full-size photos, then stamp both the
# full-size files and the thumbnails with copyright metadata.
#
# The Studio gallery shows square tiles of roughly 104-140px and the Image
# Viewer's filmstrip shows 50px ones, so a 400px square covers both at 2x
# retina. The crop is centred, matching the `object-fit: cover` the CSS would
# apply anyway.
#
# cwebp discards metadata on encode, so stamping always comes last. Both
# steps are idempotent — re-running replaces what is there.
#
# Run after adding, removing or reordering photos:
#   bash tools/build-gallery.sh
set -euo pipefail

cd "$(dirname "$0")/.."
SRC="img/gallery"
OUT="$SRC/thumbs"
SIZE=400

CREATOR="Johnny Vigersten"
NOTICE="© Johnny Vigersten - True Friends Group"

for bin in cwebp webpmux python3; do
  command -v "$bin" >/dev/null || { echo "$bin not found (brew install webp)"; exit 1; }
done
mkdir -p "$OUT"

# ---------- 1. thumbnails ----------
# Drop thumbs whose source is gone, so deletions leave no orphans.
for t in "$OUT"/*.webp; do
  [ -e "$t" ] || continue
  [ -e "$SRC/$(basename "$t")" ] || { rm "$t"; echo "removed orphan $(basename "$t")"; }
done

n=0
for f in "$SRC"/[0-9][0-9].webp; do
  name=$(basename "$f")
  w=$(sips -g pixelWidth  "$f" | awk '/pixelWidth/{print $2}')
  h=$(sips -g pixelHeight "$f" | awk '/pixelHeight/{print $2}')
  s=$(( w < h ? w : h ))                 # centre square
  x=$(( (w - s) / 2 ))
  y=$(( (h - s) / 2 ))
  cwebp -q 80 -m 6 -quiet \
        -crop "$x" "$y" "$s" "$s" -resize "$SIZE" "$SIZE" \
        "$f" -o "$OUT/$name"
  n=$(( n + 1 ))
done
echo "built $n thumbnails in $OUT"

# ---------- 2. copyright metadata ----------
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

# EXIF: a minimal little-endian TIFF block carrying Artist (0x013B) and
# Copyright (0x8298). Both are ASCII-typed; the bytes are UTF-8, which is
# what every reader in practice expects for a © sign.
CREATOR="$CREATOR" NOTICE="$NOTICE" python3 - "$TMP/c.exif" <<'PY'
import os, struct, sys

def ascii_entry(tag, text):
    return tag, 2, text.encode("utf-8") + b"\0"

entries = [ascii_entry(0x013B, os.environ["CREATOR"]),
           ascii_entry(0x8298, os.environ["NOTICE"])]
entries.sort()                                   # IFD entries must ascend by tag

header = b"II" + struct.pack("<HI", 42, 8)
ifd_len = 2 + 12*len(entries) + 4
out, tail, offset = b"", b"", 8 + ifd_len
for tag, typ, raw in entries:
    if len(raw) <= 4:
        value = raw.ljust(4, b"\0")
    else:
        value = struct.pack("<I", offset)
        tail += raw
        offset += len(raw)
    out += struct.pack("<HHI", tag, typ, len(raw)) + value
blob = header + struct.pack("<H", len(entries)) + out + struct.pack("<I", 0) + tail
open(sys.argv[1], "wb").write(blob)
PY

# XMP: dc:rights and dc:creator, plus the xmpRights "Marked" flag that
# signals the work is not public domain.
python3 - "$TMP/c.xmp" "$CREATOR" "$NOTICE" <<'PY'
import sys
from xml.sax.saxutils import escape
path, creator, notice = sys.argv[1], sys.argv[2], sys.argv[3]
open(path, "w", encoding="utf-8").write(f'''<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about=""
   xmlns:dc="http://purl.org/dc/elements/1.1/"
   xmlns:xmpRights="http://ns.adobe.com/xap/1.0/rights/">
   <dc:rights><rdf:Alt><rdf:li xml:lang="x-default">{escape(notice)}</rdf:li></rdf:Alt></dc:rights>
   <dc:creator><rdf:Seq><rdf:li>{escape(creator)}</rdf:li></rdf:Seq></dc:creator>
   <xmpRights:Marked>True</xmpRights:Marked>
   <xmpRights:UsageTerms><rdf:Alt><rdf:li xml:lang="x-default">{escape(notice)}. All rights reserved.</rdf:li></rdf:Alt></xmpRights:UsageTerms>
  </rdf:Description>
 </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>''')
PY

m=0
for f in "$SRC"/[0-9][0-9].webp "$OUT"/[0-9][0-9].webp; do
  webpmux -set exif "$TMP/c.exif" "$f" -o "$TMP/a.webp" >/dev/null 2>&1
  webpmux -set xmp  "$TMP/c.xmp"  "$TMP/a.webp" -o "$f" >/dev/null 2>&1
  m=$(( m + 1 ))
done
echo "stamped $m files with: $NOTICE"
