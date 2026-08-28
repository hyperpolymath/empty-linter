#!/usr/bin/env bash
# SPDX-License-Identifier: MPL-2.0
# SPDX-FileCopyrightText: 2026 hyperpolymath
set -euo pipefail

# Only ByteDetector currently has a complete semantic AffineScript
# implementation. Do not generate apparently usable artefacts from the TODO
# stubs elsewhere under src/.
compiler="${AFFINESCRIPT_BIN:-affinescript}"
mkdir -p build
"$compiler" check stdlib/ByteDetector.affine
"$compiler" compile --deno-esm \
  -o build/ByteDetector.affine.esm.js stdlib/ByteDetector.affine
bun build build/ByteDetector.affine.esm.js \
  --outfile src/core/ByteDetector.bun.js --target bun

echo "Built the implemented ByteDetector for Bun. Other source modules remain unimplemented."
