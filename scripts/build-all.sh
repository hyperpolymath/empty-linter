#!/usr/bin/env bash
# SPDX-License-Identifier: MPL-2.0
# SPDX-FileCopyrightText: 2026 hyperpolymath
set -euo pipefail

SOURCES=(
  stdlib/SafeHex.affine
  stdlib/SafeWhitespace.affine
  stdlib/SafePath.affine
  stdlib/SafeString.affine
  src/core/ByteDetector.affine
  src/core/TextTransform.affine
  src/core/PathHandler.affine
  EmptyLinter.affine
  src/cli/Main.affine
)

for f in "${SOURCES[@]}"; do
  affinescript compile --deno-esm "$f" -o "${f%.affine}.deno.js"
done

# Workaround: AffineScript alpha compiler (issue #122) does not fully inline
# cross-module dependencies into TextTransform.deno.js. Inject missing symbols
# after compilation: LF/CRLF/CR (zero-arg enum constructors), is_invisible
# (private helper from SafeWhitespace), concat (string stdlib fn).
TARGET="src/core/TextTransform.deno.js"
MARKER="// ---- end runtime ----"
PATCH='const LF={tag:"LF"};const CRLF={tag:"CRLF"};const CR={tag:"CR"};\nfunction is_invisible(c){return(c===0||c===160||c===8203||c===65279||c===173||c===8206||c===8207||c===8204||c===8205||c===8288);}\nfunction concat(a,b){return __as_concat(a,b);}'
if [ -f "$TARGET" ] && ! grep -qF 'const LF={tag:"LF"}' "$TARGET"; then
  awk -v marker="$MARKER" -v patch="$PATCH" '
    { print }
    $0 == marker { printf "%s\n", patch }
  ' "$TARGET" > "$TARGET.tmp" && mv "$TARGET.tmp" "$TARGET"
fi

echo "build-all complete"
