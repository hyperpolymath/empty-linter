# SPDX-License-Identifier: AGPL-3.0-or-later
set shell := ["bash", "-uc"]
set dotenv-load := true
set positional-arguments := true

project := "empty-linter"
version := "0.1.0"
tier := "infrastructure"

# ═══════════════════════════════════════════════════════════════════════════════
# DEFAULT & HELP
# ═══════════════════════════════════════════════════════════════════════════════

default:
    @just --list --unsorted

# ═══════════════════════════════════════════════════════════════════════════════
# BUILD & COMPILE
# ═══════════════════════════════════════════════════════════════════════════════

# Transpile ReScript to JS for Deno runtime
build:
    @echo "Building {{project}}..."
    rescript build

# ═══════════════════════════════════════════════════════════════════════════════
# LINT & FORMAT (The Crap-Overlay)
# ═══════════════════════════════════════════════════════════════════════════════

# Audit the project for invisible "crap" voids (Magenta Overlay)
audit path=".":
    @deno run --allow-read lib/js/src/EmptyLinter.bs.js {{path}}

# Enforce symbolic intent (0xA0 -> 0x20 conversion)
fix:
    @echo "Purging invisible voids..."
    find . -type f -not -path '*/.*' -exec sed -i 's/\xc2\xa0/ /g' {} +
    @echo "Sanitisation complete."

# ═══════════════════════════════════════════════════════════════════════════════
# DOCUMENTATION
# ═══════════════════════════════════════════════════════════════════════════════

# Generate the RSR-compliant cookbook
cookbook:
    #!/usr/bin/env bash
    mkdir -p docs
    OUTPUT="docs/just-cookbook.adoc"
    echo "= {{project}} Justfile Cookbook" > "$OUTPUT"
    echo ":toc: left" >> "$OUTPUT"
    echo "" >> "$OUTPUT"
    echo "== Recipes" >> "$OUTPUT"
    just --list --unsorted | while read -r line; do
        if [[ "$line" =~ ^[[:space:]]+([a-z_-]+) ]]; then
            recipe="${BASH_REMATCH[1]}"
            echo "=== $recipe" >> "$OUTPUT"
            echo "[source,bash]" >> "$OUTPUT"
            echo "----" >> "$OUTPUT"
            echo "just $recipe" >> "$OUTPUT"
            echo "----" >> "$OUTPUT"
        fi
    done

# ═══════════════════════════════════════════════════════════════════════════════
# UTILITIES
# ═══════════════════════════════════════════════════════════════════════════════

# Generate the multi-shell registry (nushell, fish, minix, etc)
gen-shells:
    @deno run --allow-write scripts/generate_wrappers.ts
