// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Jonathan D.A. Jewell
//
// ScalarScanner.bun.js — scalar-accurate text scanning.
//
// The legacy ByteDetector iterates UTF-16 code units (`content[i]`), which
// makes its "column" a string index and mis-handles astral characters. Issue
// #74 forbids labelling string indices as Unicode columns. This scanner:
//
//   * iterates Unicode scalar values (`for…of` delivers whole code points);
//   * reports a one-based line, a one-based column in Unicode scalars, and a
//     zero-based UTF-8 byte offset;
//   * attaches the UTF-8 byte sequence of every finding;
//   * runs the configurable zalgo / suspicious combining-mark detector in the
//     same pass, without rejecting legitimate scripts or diacritics.
//
// Positions never lie: `line`, `column`, and `byte_offset` are always the
// position of the flagged scalar itself; for a zalgo run they are the position
// of the first combining mark of the run.

import { forCodePoint, hex, utf8Hex, utf8Length } from "./UnicodeData.bun.js";
import { escapedContext } from "./Render.bun.js";

export const ZALGO_RUN_NAME = "ZALGO_RUN";
export const DEFAULT_ZALGO_MAX_COMBINING = 4;

// Nonspacing (Mn) and enclosing (Me) marks: the combining classes zalgo uses.
// Spacing marks (Mc) are visible and intentionally excluded.
const IS_COMBINING_MARK = /[\p{Mn}\p{Me}]/u;

/**
 * Scan decoded text for invisible/suspicious characters.
 *
 * @param {string} content Decoded text (must already be valid UTF-16 text —
 *   the caller decodes bytes fatally and turns malformed input into a distinct
 *   scanner error, never a finding).
 * @param {object} [options]
 * @param {boolean} [options.catalogue=true]      Run the code-point catalogue.
 * @param {boolean} [options.zalgo=true]          Run the combining-mark detector.
 * @param {number}  [options.zalgoMaxCombining=4] Flag runs of this many or more
 *   consecutive Mn/Me marks on one base character.
 * @param {number}  [options.contextRadius=12]    Escaped context window, in scalars.
 * @returns {{findings: object[], scannedScalars: number}}
 */
export function scanText(content, options = {}) {
  const useCatalogue = options.catalogue !== false;
  const useZalgo = options.zalgo !== false;
  const zalgoMaxCombining = options.zalgoMaxCombining ?? DEFAULT_ZALGO_MAX_COMBINING;
  const contextRadius = options.contextRadius ?? 12;
  const includeContext = options.context !== false;

  const findings = [];

  let scalarIndex = 0; // 0-based index in scalar space
  let line = 1; // 1-based display line
  let column = 1; // 1-based column in Unicode scalars
  let byteOffset = 0; // 0-based UTF-8 byte offset

  // Zalgo run state
  let runBase = null; // base scalar string of the current cluster
  let runStart = null; // position record of the run's first combining mark
  let runLength = 0;
  let runScalars = 0; // total scalars in the cluster (base + marks)

  const flushRun = () => {
    if (runStart !== null && runLength >= zalgoMaxCombining) {
      findings.push({
        code_point: runStart.code_point,
        utf8_hex: utf8Hex(runStart.code_point),
        name: ZALGO_RUN_NAME,
        unicode_name: "SUSPICIOUS COMBINING MARK SEQUENCE",
        category: "Mn",
        severity: "error",
        safety: "ambiguous",
        fix: { kind: "review" },
        description:
          `${runLength} combining marks stacked on one base character ` +
          `(${describeBase(runBase)}); legitimate scripts rarely exceed three. ` +
          `Classic zalgo / diacritic-abuse pattern.`,
        line: runStart.line,
        column: runStart.column,
        byte_offset: runStart.byte_offset,
        scalar_index: runStart.scalar_index,
        cluster_scalars: runScalars,
        combining_marks: runLength,
        context_escaped: includeContext
          ? escapedContext(content, runStart.scalar_index, contextRadius)
          : undefined,
      });
    }
    runBase = null;
    runStart = null;
    runLength = 0;
    runScalars = 0;
  };

  for (const scalar of content) {
    const cp = scalar.codePointAt(0);
    const isMark = useZalgo && cp !== 0x0a && IS_COMBINING_MARK.test(scalar);

    // Zalgo cluster bookkeeping
    if (useZalgo) {
      if (isMark) {
        if (runBase === null && runLength === 0 && runScalars === 0) {
          // Combining mark with no remembered base (start of text/line): still
          // track it as a baseless run so orphaned mark storms are flagged.
          runStart = { line, column, byte_offset: byteOffset, scalar_index: scalarIndex, code_point: cp };
          runLength = 1;
          runScalars = 1;
        } else if (runStart === null) {
          runStart = { line, column, byte_offset: byteOffset, scalar_index: scalarIndex, code_point: cp };
          runLength = 1;
          runScalars += 1;
        } else {
          runLength += 1;
          runScalars += 1;
        }
      } else {
        flushRun();
        runBase = scalar;
        runScalars = 1;
      }
    }

    // Catalogue check
    if (useCatalogue) {
      const def = forCodePoint(cp);
      if (def !== null) {
        findings.push({
          code_point: cp,
          utf8_hex: utf8Hex(cp),
          name: def.name,
          unicode_name: def.unicode_name,
          category: def.category,
          severity: def.severity,
          safety: def.safety,
          fix: def.fix,
          description: def.description,
          line,
          column,
          byte_offset: byteOffset,
          scalar_index: scalarIndex,
          context_escaped: includeContext
            ? escapedContext(content, scalarIndex, contextRadius)
            : undefined,
        });
      }
    }

    // Advance position counters.
    if (cp === 0x0a) {
      line += 1;
      column = 1;
    } else {
      column += 1;
    }
    byteOffset += utf8Length(cp);
    scalarIndex += 1;
  }

  flushRun();

  findings.sort((a, b) => a.byte_offset - b.byte_offset || a.code_point - b.code_point);
  return { findings, scannedScalars: scalarIndex };
}

function describeBase(base) {
  if (base === null) return "no base character — orphaned marks";
  const cp = base.codePointAt(0);
  return /^[\x20-\x7e]$/u.test(base) ? `'${base}' (U+${hex(cp)})` : `U+${hex(cp)}`;
}
