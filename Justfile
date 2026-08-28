# SPDX-License-Identifier: MPL-2.0
# SPDX-FileCopyrightText: 2026 Jonathan D.A. Jewell <j.d.a.jewell@open.ac.uk>
set shell := ["bash", "-uc"]
set dotenv-load := true
set positional-arguments := true

import? "contractile.just"

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

# Compile AffineScript to ESM, then bundle and tree-shake it for Bun. The
# AffineScript compiler's direct ESM switch is still named --deno-esm; the
# intermediate stays under ignored build/ and is never the shipped runtime.
build:
    @echo "Building {{project}}..."
    @set -euo pipefail; \
      compiler="${AFFINESCRIPT_BIN:-affinescript}"; \
      rm -f build/ByteDetector.affine.esm.js; \
      "$compiler" check stdlib/ByteDetector.affine; \
      mkdir -p build; \
      "$compiler" compile --deno-esm -o build/ByteDetector.affine.esm.js stdlib/ByteDetector.affine; \
      bun build build/ByteDetector.affine.esm.js --outfile src/core/ByteDetector.bun.js --target bun

# Clean build artifacts
clean:
    @echo "Cleaning {{project}}..."
    @rm -f build/ByteDetector.affine.esm.js

# Watch mode is not yet connected to the two-stage Bun build
dev:
    @echo "empty-linter: watch mode is not implemented for the Bun build" >&2
    @exit 2

# ═══════════════════════════════════════════════════════════════════════════════
# TESTING
# ═══════════════════════════════════════════════════════════════════════════════

# Run all tests
test: build
    @echo "Running implemented core and CI audit tests..."
    bun test tests/ByteDetector_test.js tests/empty_lint_ci_test.js

# Run tests with verbose output
test-verbose: build
    @echo "Running tests (verbose)..."
    bun test --verbose tests/ByteDetector_test.js tests/empty_lint_ci_test.js

# Run specific test file
test-file file: build
    @echo "Running {{file}}..."
    bun test tests/{{file}}

# ═══════════════════════════════════════════════════════════════════════════════
# LINT & FORMAT (The Crap-Overlay)
# ═══════════════════════════════════════════════════════════════════════════════

# Audit the project for invisible "crap" voids (Magenta Overlay)
audit path=".": build
    @bun run scripts/empty-lint-ci.js {{path}}

# Quick audit using direct module
audit-quick path=".": build
    @bun run scripts/empty-lint-ci.js {{path}}

# Refuse unavailable automatic repair
fix path=".": build
    @echo "empty-linter: automatic repair is not implemented; audit and review findings instead" >&2
    @exit 2

# Refuse unavailable transformations
transform path: build
    @echo "empty-linter: transformation is not implemented" >&2
    @exit 2

# Refuse unavailable workspace constraints
check path workspace="twitter": build
    @echo "empty-linter: workspace constraints are not implemented" >&2
    @exit 2

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

# Refuse unavailable shell-wrapper generation
gen-shells:
    @echo "empty-linter: shell-wrapper generation is not implemented" >&2
    @exit 2

# Run panic-attacker pre-commit scan
assail:
    @command -v panic-attack >/dev/null 2>&1 && panic-attack assail . || echo "panic-attack not found — install from https://github.com/hyperpolymath/panic-attacker"

# ═══════════════════════════════════════════════════════════════════════════════
# ONBOARDING & DIAGNOSTICS
# ═══════════════════════════════════════════════════════════════════════════════

# Check all required toolchain dependencies and report health
doctor:
    #!/usr/bin/env bash
    echo "═══════════════════════════════════════════════════"
    echo "  Empty Linter Doctor — Toolchain Health Check"
    echo "═══════════════════════════════════════════════════"
    echo ""
    PASS=0; FAIL=0; WARN=0
    check() {
        local name="$1" cmd="$2" min="$3"
        if command -v "$cmd" >/dev/null 2>&1; then
            VER=$("$cmd" --version 2>&1 | head -1)
            echo "  [OK]   $name — $VER"
            PASS=$((PASS + 1))
        else
            echo "  [FAIL] $name — not found (need $min+)"
            FAIL=$((FAIL + 1))
        fi
    }
    check "just"              just      "1.25" 
    check "git"               git       "2.40" 
    check "Bun"               bun       "1.3"
    check "AffineScript"       affinescript  "0.1"
    check "Zig"               zig       "0.13" 
    # Optional tools
    if command -v panic-attack >/dev/null 2>&1; then
        echo "  [OK]   panic-attack — available"
        PASS=$((PASS + 1))
    else
        echo "  [WARN] panic-attack — not found (pre-commit scanner)"
        WARN=$((WARN + 1))
    fi
    echo ""
    echo "  Result: $PASS passed, $FAIL failed, $WARN warnings"
    if [ "$FAIL" -gt 0 ]; then
        echo "  Run 'just heal' to attempt automatic repair."
        exit 1
    fi
    echo "  All required tools present."

# Report missing tools without installing software
heal:
    #!/usr/bin/env bash
    echo "═══════════════════════════════════════════════════"
    echo "  Empty Linter Heal — Automatic Tool Installation"
    echo "═══════════════════════════════════════════════════"
    echo ""
    if ! command -v bun >/dev/null 2>&1; then
        echo "Bun is required. Install it using the estate toolchain instructions."
    fi
    if ! command -v just >/dev/null 2>&1; then
        echo "Just is required. Install it using the estate toolchain instructions."
    fi
    echo ""
    echo "Heal complete. Run 'just doctor' to verify."

# Guided tour of the project structure and key concepts
tour:
    #!/usr/bin/env bash
    echo "═══════════════════════════════════════════════════"
    echo "  Empty Linter — Guided Tour"
    echo "═══════════════════════════════════════════════════"
    echo ""
    echo '**empty-linter** is a toolkit designed to see "what is not there." It purges invisible artifacts--NBSPs, Zero-Width spaces, and null bytes--that corrupt file integrity and cause neural-generated character mess to fail in symbolic parsers.'
    echo ""
    echo "Key directories:"
    echo "  src/                      Source code" 
    echo "  lib/                      Library modules" 
    echo "  ffi/                      Foreign function interface (Zig)" 
    echo "  src/abi/                  Idris2 ABI definitions" 
    echo "  docs/                     Documentation" 
    echo "  tests/                    Test suite" 
    echo "  .github/workflows/        CI/CD workflows" 
    echo "  contractiles/             Must/Trust/Dust contracts" 
    echo "  .machine_readable/        Machine-readable metadata" 
    echo "  examples/                 Usage examples" 
    echo ""
    echo "Quick commands:"
    echo "  just doctor    Check toolchain health"
    echo "  just heal      Fix missing tools"
    echo "  just help-me   Common workflows"
    echo "  just default   List all recipes"
    echo ""
    echo "Read more: README.adoc, EXPLAINME.adoc"

# Show help for common workflows
help-me:
    #!/usr/bin/env bash
    echo "═══════════════════════════════════════════════════"
    echo "  Empty Linter — Common Workflows"
    echo "═══════════════════════════════════════════════════"
    echo ""
    echo "FIRST TIME SETUP:"
    echo "  just doctor           Check toolchain"
    echo "  just heal             Report missing tools"
    echo ""
    echo "DEVELOPMENT:" 
    echo "  bun test              Run implemented tests"
    echo "" 
    echo "PRE-COMMIT:"
    echo "  just assail           Run panic-attacker scan"
    echo ""
    echo "LEARN:"
    echo "  just tour             Guided project tour"
    echo "  just default          List all recipes"


# Print the current CRG grade (reads from READINESS.md '**Current Grade:** X' line)
crg-grade:
    @grade=$$(grep -oP '(?<=\*\*Current Grade:\*\* )[A-FX]' READINESS.md 2>/dev/null | head -1); \
    [ -z "$$grade" ] && grade="X"; \
    echo "$$grade"

# Generate a shields.io badge markdown for the current CRG grade
# Looks for '**Current Grade:** X' in READINESS.md; falls back to X
crg-badge:
    @grade=$$(grep -oP '(?<=\*\*Current Grade:\*\* )[A-FX]' READINESS.md 2>/dev/null | head -1); \
    [ -z "$$grade" ] && grade="X"; \
    case "$$grade" in \
      A) color="brightgreen" ;; B) color="green" ;; C) color="yellow" ;; \
      D) color="orange" ;; E) color="red" ;; F) color="critical" ;; \
      *) color="lightgrey" ;; esac; \
    echo "[![CRG $$grade](https://img.shields.io/badge/CRG-$$grade-$$color?style=flat-square)](https://github.com/hyperpolymath/standards/tree/main/component-readiness-grades)"

secret-scan-trufflehog:
    @command -v trufflehog >/dev/null && trufflehog filesystem . --only-verified || true
