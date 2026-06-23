<!--
SPDX-License-Identifier: MPL-2.0
Copyright (c) Jonathan D.A. Jewell <j.d.a.jewell@open.ac.uk>
-->
<!-- TOPOLOGY.md — Project architecture map and completion dashboard -->
<!-- Last updated: 2026-02-19 -->

# empty-linter — Project Topology

## System Architecture

```
                        ┌─────────────────────────────────────────┐
                        │              OPERATOR / AGENT           │
                        │        (just audit / correct / shell)   │
                        └───────────────────┬─────────────────────┘
                                            │
                                            ▼
                        ┌─────────────────────────────────────────┐
                        │           ORCHESTRATION LAYER           │
                        │  ┌───────────┐  ┌───────────────────┐  │
                        │  │  Nickel   │  │  Justfile         │  │
                        │  │ (config)  │  │ (Task Runner)     │  │
                        │  └─────┬─────┘  └────────┬──────────┘  │
                        └────────│─────────────────│──────────────┘
                                 │                 │
                                 ▼                 ▼
                        ┌─────────────────────────────────────────┐
                        │           LOGIC LAYER (RESCRIPT)        │
                        │    (Negative-Space Diagnostics, Fixes)  │
                        │  ┌───────────┐  ┌───────────────────┐  │
                        │  │  Audit    │  │  Correction       │  │
                        │  │  Engine   │  │  (Sanitization)   │  │
                        │  └─────┬─────┘  └────────┬──────────┘  │
                        └────────│─────────────────│──────────────┘
                                 │                 │
                                 ▼                 ▼
                        ┌─────────────────────────────────────────┐
                        │           RUNTIME (DENO)                │
                        │    (Secure FS access, JS execution)     │
                        └──────────┬───────────────────┬──────────┘
                                   │                   │
                                   ▼                   ▼
                        ┌───────────────────────┐  ┌────────────────────────────────┐
                        │ IDRIS INSIDE (PROVEN) │  │ TARGET FILESYSTEM              │
                        │ - SafeWhitespace      │  │ (Purging NBSP, ZWSP,           │
                        │ - SafePath, SafeHex   │  │  Null Bytes)                   │
                        └───────────────────────┘  └────────────────────────────────┘

                        ┌─────────────────────────────────────────┐
                        │          REPO INFRASTRUCTURE            │
                        │  Multi-Shell Shims  .machine_readable/  │
                        │  VS Code Extension  Userscripts         │
                        └─────────────────────────────────────────┘
```

## Completion Dashboard

```
COMPONENT                          STATUS              NOTES
─────────────────────────────────  ──────────────────  ─────────────────────────────────
DIAGNOSTIC CORE
  Audit Engine (ReScript)           ██████████ 100%    NBSP/ZWSP detection stable
  Correction Logic                  ██████████ 100%    0xA0 -> 0x20 auto-fix active
  Magenta Crap-Overlay              ████████░░  80%    Offset reporting verified

LOGIC & VERIFICATION
  Idris Inside (proven)             ██████████ 100%    SafeWhitespace modules active
  SafePath / SafeHex                ██████████ 100%    FS access verified
  Nickel config.ncl                 ██████████ 100%    Structural intent defined

INTERFACES & DEPLOY
  Justfile Automation               ██████████ 100%    Audit/Correct/Deploy recipes
  Multi-Shell Registry              ████████░░  80%    18+ shell shims expanding
  VS Code Extension                 ██████░░░░  60%    Real-time linting in progress

REPO INFRASTRUCTURE
  Deno Tooling                      ██████████ 100%    Secure-by-default execution
  .machine_readable/                ██████████ 100%    STATE.adoc tracking
  Podman / nerdctl build            ██████████ 100%    Deterministic containers

─────────────────────────────────────────────────────────────────────────────
OVERALL:                            █████████░  ~90%   Alpha release production-ready
```

## Key Dependencies

```
Nickel Config ───► Just Runner ───► Deno Exec ───► ReScript Logic
                                      │                 │
                                      ▼                 ▼
                                 Target FS ◄──── Proven Proofs
```

## Update Protocol

This file is maintained by both humans and AI agents. When updating:

1. **After completing a component**: Change its bar and percentage
2. **After adding a component**: Add a new row in the appropriate section
3. **After architectural changes**: Update the ASCII diagram
4. **Date**: Update the `Last updated` comment at the top of this file

Progress bars use: `█` (filled) and `░` (empty), 10 characters wide.
Percentages: 0%, 10%, 20%, ... 100% (in 10% increments).
