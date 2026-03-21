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

# [AUTO-GENERATED] Multi-arch / RISC-V target
build-riscv:
	@echo "Building for RISC-V..."
	cross build --target riscv64gc-unknown-linux-gnu

# Run panic-attacker pre-commit scan
assail:
    @command -v panic-attack >/dev/null 2>&1 && panic-attack assail . || echo "panic-attack not found — install from https://github.com/hyperpolymath/panic-attacker"
