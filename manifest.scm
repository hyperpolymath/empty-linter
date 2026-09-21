;; SPDX-License-Identifier: MPL-2.0
;; SPDX-FileCopyrightText: 2026 Jonathan D.A. Jewell
;;
;; manifest.scm — developer environment for empty-linter.
;;
;; Estate package policy (0-canon/rsr/3-practice/LANGUAGE-POLICY.adoc, RULED
;; 2026-05-18): Guix is the primary packager, sealed container is the escape
;; hatch, Nix is not a tier. This file is the Guix artefact for this repo.
;;
;; Honest scope note: the product's tier-1 runtime is Bun, and Bun is not yet
;; packaged in GNU Guix. It is provisioned separately at a pinned version
;; (pinned in .github/workflows/dogfood-gate.yml; see README.adoc "Runtime and
;; build"). This manifest covers
;; the surrounding toolchain that Guix *does* carry, so
;;
;;     guix shell -m manifest.scm
;;
;; reproduces the rest of the developer environment. When Bun lands in Guix,
;; add it here and retire the external pin.

(specifications->manifest
 '("just"       ; task runner (Justfile)
   "git"        ; version control + diff tooling
   "jq"         ; inspecting the JSON surfaces (schemas, provenance, rescan)
   "coreutils")) ; sha256sum et al. for provenance verification
