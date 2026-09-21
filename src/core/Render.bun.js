// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Jonathan D.A. Jewell
//
// Render.bun.js — visible representation of invisible text.
//
// Two products:
//
//   escapedContext()  a short, escaped window around a finding, with the
//                     finding marked up — the "visible escaped context" the
//                     issue's acceptance fixture demands.
//   renderVisible()   a whole-file "show formatting marks" rendering in the
//                     spirit of `:set list` / an editor's pilcrow view:
//                     spaces as ·, tabs as →, flagged characters as
//                     ⟦U+XXXX NAME⟧, everything else verbatim.
//
// Determinism is part of the contract: outputs are pinned by the test suite so
// reports can be diffed and snapshot-tested downstream.

import { forCodePoint, hex } from "./UnicodeData.bun.js";

const VISIBILITY_MARKER_OPEN = "⟦";
const VISIBILITY_MARKER_CLOSE = "⟧";

/** True for scalars we treat as self-rendering in escaped output. */
function isSelfRendering(scalar) {
  const cp = scalar.codePointAt(0);
  if (cp >= 0x20 && cp <= 0x7e) return true; // printable ASCII
  // Visible, self-describing classes; combining marks alone are not.
  return /^[\p{L}\p{N}\p{P}\p{S}\p{Mc}]$/u.test(scalar);
}

/**
 * The escaped, display-safe rendering of one scalar.
 * @param {string} scalar A single Unicode scalar.
 * @param {boolean} [plain=false] When true, only catalogue-flagged scalars get
 *   markers; other non-self-rendering scalars use \uXXXX short form.
 */
export function escapeScalar(scalar, plain = false) {
  const cp = scalar.codePointAt(0);
  const def = forCodePoint(cp);
  if (def !== null) {
    return `${VISIBILITY_MARKER_OPEN}U+${hex(cp)} ${def.name}${VISIBILITY_MARKER_CLOSE}`;
  }
  if (isSelfRendering(scalar) && scalar !== VISIBILITY_MARKER_OPEN && scalar !== VISIBILITY_MARKER_CLOSE) {
    return scalar;
  }
  return plain ? `\\u${hex(cp)}` : `${VISIBILITY_MARKER_OPEN}U+${hex(cp)}${VISIBILITY_MARKER_CLOSE}`;
}

/**
 * An escaped window of ±radius scalars around the scalar at `scalarIndex`,
 * joined into one display string. Ellipses (…) mark truncation.
 */
export function escapedContext(content, scalarIndex, radius = 12) {
  const start = Math.max(0, scalarIndex - radius);
  const end = scalarIndex + radius + 1;
  const parts = [];
  let index = 0;
  for (const scalar of content) {
    if (index >= end) break;
    if (index >= start) {
      if (scalar === "\n") {
        parts.push("⏎");
      } else if (scalar === "\t") {
        parts.push("⇥");
      } else {
        parts.push(escapeScalar(scalar));
      }
    }
    index += 1;
  }
  const prefix = start > 0 ? "…" : "";
  const suffix = index >= end && contentLengthBeyond(content, end) ? "…" : "";
  return `${prefix}${parts.join("")}${suffix}`;
}

// True when the content contains any scalar at position >= `from`.
function contentLengthBeyond(content, from) {
  let index = 0;
  for (const _ of content) {
    if (index >= from) return true;
    index += 1;
  }
  return false;
}

/**
 * Whole-text rendering comparable to an editor's "show formatting marks":
 *
 *   space            → ·
 *   tab              → → (followed by nothing; the arrow itself is the tab)
 *   newline          → ⏎\n (marker, then the real line break)
 *   flagged scalar   → ⟦U+XXXX NAME⟧ (catalogue definition)
 *   anything else    → verbatim
 *
 * @param {string} content
 * @param {object} [options]
 * @param {boolean} [options.showSpaces=true]  Render U+0020 as · where safe.
 */
export function renderVisible(content, options = {}) {
  const showSpaces = options.showSpaces !== false;
  const parts = [];
  for (const scalar of content) {
    if (scalar === "\n") {
      parts.push("⏎\n");
    } else if (scalar === "\t") {
      parts.push("→");
    } else if (scalar === " " && showSpaces) {
      parts.push("·");
    } else {
      parts.push(escapeScalar(scalar));
    }
  }
  return parts.join("");
}
