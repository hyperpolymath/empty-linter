<!--
SPDX-License-Identifier: CC-BY-SA-4.0
SPDX-FileCopyrightText: 2025-2026 Jonathan D.A. Jewell <j.d.a.jewell@open.ac.uk>
-->

![Crap-Overlay](https://img.shields.io/badge/Overlay-Magenta-brightgreen.svg)
![ReScript](https://img.shields.io/badge/Logic-ReScript-orange.svg)
![Deno](https://img.shields.io/badge/Runtime-Deno-white.svg) ![Idris
Inside](https://img.shields.io/badge/Idris_Inside-proven-purple.svg)

# The Objective

**empty-linter** is a toolkit designed to see "what is not there." It
purges invisible artifacts—​NBSPs, Zero-Width spaces, and null bytes—​that
corrupt file integrity and cause neural-generated character mess to fail
in symbolic parsers.

It acts as the "Eyes" for agents, enforcing symbolic structural intent
over hidden "crap-voids."

- **Config:** Managed via `config.ncl` (Nickel).

- **Task Runner:** Managed via `Justfile` (Just).

- **Logic:** Written in ReScript, executed via Deno.

- **Verification:** Powered by [proven
  library](https://github.com/hyperpolymath/proven) with Idris 2
  dependent types.

- **Deployment:** nerdctl-first, supporting Linux, Minix, macOS, iOS,
  Android, and PC.

# Idris Inside: Mathematically Verified Operations

This project uses the **proven** library for mathematically verified
operations. The following modules are integrated:

| Module | Purpose | Source File |
|----|----|----|
| SafeHex | Constant-time hex encoding/decoding | `ByteDetector.res` |
| SafePath | Traversal-proof path validation | `PathHandler.res` |
| SafeString | XSS/SQL injection prevention | `TextTransform.res` |
| SafeWhitespace | Text normalization without data loss (NEW) | `TextTransform.res` |

Operations marked with "Idris Inside" have compile-time proofs that they
cannot crash or corrupt data.

# Crap-Overlay Playbook

1.  **Audit:** Identify invisible artifacts.

2.  **Highlight:** Magenta-coded reporting of offsets.

3.  **Correct:** 0xA0 to 0x20 conversion and ZWSP stripping.

# Quick Start (Bash)

The primary entry point for Bash is provided below. For all other
supported shells (including `nushell`, `fish`, `minix` `shell`,
`elvish`, etc.), please refer to [The Multi-Shell
Registry](docs/SHELLS.adoc).

```bash
#!/usr/bin/env bash
# Primary Bash wrapper for empty-linter
# Usage: ./bin/empty-linter.sh [directory]

TARGET=${1:-"."}

if ! command -v deno &> /dev/null; then
    echo "Deno not found. Please install Deno to run empty-linter."
    exit 1
fi

deno run --allow-read lib/js/src/EmptyLinter.bs.js "$TARGET"
```

# Usage via Just

We prefer the use of `just` for all development tasks. Refer to the
[Cookbook](cookbook.adoc) for a full list of recipes.

```bash
# Run the Magenta crap-overlay report
just audit

# Sanitise the codebase (Auto-fix voids)
just correct
```

# Configuration (Nickel)

All structural intent is defined in `config.ncl`:

```nickel
{
  linter = {
    target_dir = ".",
    severity = "error",
    overlay_color = "magenta",
    auto_fix = true,
  }
}
```

# Deployment

Deployment is handled via Podman to ensure cross-platform compatibility
across edge tech and ASICs.

```bash
just deploy-nerctl
```

# Architecture

See <a href="TOPOLOGY.md" class="md">TOPOLOGY</a> for a visual
architecture map and completion dashboard.
