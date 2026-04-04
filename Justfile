# SPDX-License-Identifier: PMPL-1.0-or-later
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

# Clean build artifacts
clean:
    @echo "Cleaning {{project}}..."
    rescript clean

# Watch mode for development
dev:
    @echo "Starting watch mode..."
    rescript build -w

# ═══════════════════════════════════════════════════════════════════════════════
# TESTING
# ═══════════════════════════════════════════════════════════════════════════════

# Run all tests
test: build
    @echo "Running tests..."
    deno test --allow-read --allow-write tests/

# Run tests with verbose output
test-verbose: build
    @echo "Running tests (verbose)..."
    deno test --allow-read --allow-write tests/ --trace-leaks

# Run specific test file
test-file file: build
    @echo "Running {{file}}..."
    deno test --allow-read --allow-write tests/{{file}}

# ═══════════════════════════════════════════════════════════════════════════════
# LINT & FORMAT (The Crap-Overlay)
# ═══════════════════════════════════════════════════════════════════════════════

# Audit the project for invisible "crap" voids (Magenta Overlay)
audit path=".": build
    @deno run --allow-read src/cli/Main.res.js audit {{path}}

# Quick audit using direct module
audit-quick path=".": build
    @deno run --allow-read EmptyLinter.res.js {{path}}

# Enforce symbolic intent - auto-fix all artifacts
fix path=".": build
    @deno run --allow-read --allow-write src/cli/Main.res.js fix {{path}}

# Transform text using default options
transform path: build
    @deno run --allow-read --allow-write src/cli/Main.res.js transform {{path}}

# Check against workspace constraints
check path workspace="twitter": build
    @deno run --allow-read src/cli/Main.res.js check -w {{workspace}} {{path}}

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
    check "Deno"              deno      "2.0" 
    check "ReScript (resc)"   rescript  "12.0" 
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

# Attempt to automatically install missing tools
heal:
    #!/usr/bin/env bash
    echo "═══════════════════════════════════════════════════"
    echo "  Empty Linter Heal — Automatic Tool Installation"
    echo "═══════════════════════════════════════════════════"
    echo ""
if ! command -v deno >/dev/null 2>&1; then
    echo "Installing Deno..."
    curl -fsSL https://deno.land/install.sh | sh
fi
# Install Deno dependencies
echo "Installing Deno dependencies..."
deno install 2>/dev/null || true
if ! command -v just >/dev/null 2>&1; then
    echo "Installing just..."
    cargo install just 2>/dev/null || echo "Install just from https://just.systems"
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
echo "  just heal             Fix missing tools"
echo "" 
    echo "DEVELOPMENT:" 
    echo "  deno task dev         Development server" 
    echo "  deno test             Run tests" 
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
