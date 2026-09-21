// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Jonathan D.A. Jewell

import { expect, test } from "bun:test";
import { scanText, ZALGO_RUN_NAME } from "../src/core/ScalarScanner.bun.js";

const NBSP = String.fromCodePoint(0x00a0);
const EMOJI = String.fromCodePoint(0x1f600); // 😀 — astral, 2 UTF-16 units, 4 UTF-8 bytes

function only(content, options) {
  const { findings } = scanText(content, options);
  expect(findings.length).toBe(1);
  return findings[0];
}

// ── Scalar-accurate positions (the UTF-16 bug class, permanently closed) ──────

test("scanner: columns are Unicode scalars even after astral characters", () => {
  const finding = only(`${EMOJI}x${NBSP}y`);
  // scalars: 😀(1) x(2) NBSP(3) — a UTF-16 scanner would report column 4 for
  // the NBSP because the emoji takes two code units.
  expect(finding.column).toBe(3);
  expect(finding.line).toBe(1);
});

test("scanner: byte offsets are exact UTF-8 offsets", () => {
  const finding = only(`${EMOJI}${NBSP}`);
  const byteOffset = 4; // emoji is four UTF-8 bytes; NBSP starts after it
  expect(finding.byte_offset).toBe(byteOffset);
  expect(finding.utf8_hex).toBe("C2 A0");
});

test("scanner: lines advance on LF only; CR advances the column", () => {
  const finding = only(`a\r\nb${NBSP}c`);
  expect(finding.line).toBe(2);
  expect(finding.column).toBe(2);
  // bytes: a CR LF b = 4, NBSP at offset 4
  expect(finding.byte_offset).toBe(4);
});

test("scanner: multiple findings across lines carry independent positions", () => {
  const { findings } = scanText(`one${NBSP}\ntwo${NBSP}\nthree`);
  expect(findings.length).toBe(2);
  expect([findings[0].line, findings[1].line]).toEqual([1, 2]);
  // o n e = 3 bytes → first NBSP at offset 3.
  expect(findings[0].byte_offset).toBe(3);
  // +NBSP(2 bytes) +LF(1) +"two"(3) → second NBSP at offset 9, line 2, column 4.
  expect(findings[1].byte_offset).toBe(9);
  expect(findings[1].column).toBe(4);
});

// ── Zalgo detector ────────────────────────────────────────────────────────────

test("zalgo: a heavy combining run is flagged once, at the first mark", () => {
  const text = "z" + [0x0334, 0x0335, 0x0336, 0x0337, 0x0338].map((cp) => String.fromCodePoint(cp)).join("");
  const finding = only(text);
  expect(finding.name).toBe(ZALGO_RUN_NAME);
  expect(finding.severity).toBe("error");
  expect(finding.safety).toBe("ambiguous");
  expect(finding.column).toBe(2); // first combining mark
  expect(finding.combining_marks).toBe(5);
  expect(finding.description).toContain("5");
});

test("zalgo: legitimate scripts and diacritics are NOT rejected", () => {
  const legit = [
    "café naïve Zürich", // composed/borrowed diacritics
    "e" + String.fromCodePoint(0x0301), // combining acute (1 mark)
    "a" + String.fromCodePoint(0x0300, 0x0302), // two stacked marks
    "कि", // Devanagari: base + spacing mark
    "ที่", // Thai: base + 2 marks
    "ấ", // Vietnamese precomposed
    "a" + String.fromCodePoint(0x00e2) + "", // plain
    "👨‍👩‍👧‍👦", // emoji ZWJ family — no combining marks at all
    "❤️", // heart + VS16
  ];
  for (const text of legit) {
    const { findings } = scanText(text, { catalogue: true, zalgo: true });
    const zalgo = findings.filter((f) => f.name === ZALGO_RUN_NAME);
    expect(zalgo.length).toBe(0);
  }
});

test("zalgo: three combining marks pass, four flag at the default threshold", () => {
  const three = "x" + [0x0301, 0x0302, 0x0303].map((cp) => String.fromCodePoint(cp)).join("");
  const four = "x" + [0x0301, 0x0302, 0x0303, 0x0304].map((cp) => String.fromCodePoint(cp)).join("");
  expect(scanText(three).findings.filter((f) => f.name === ZALGO_RUN_NAME).length).toBe(0);
  expect(scanText(four).findings.filter((f) => f.name === ZALGO_RUN_NAME).length).toBe(1);
});

test("zalgo: threshold is configurable", () => {
  const run = "x" + [0x0301, 0x0302, 0x0303].map((cp) => String.fromCodePoint(cp)).join("");
  const { findings } = scanText(run, { zalgoMaxCombining: 3 });
  expect(findings.filter((f) => f.name === ZALGO_RUN_NAME).length).toBe(1);
});

test("zalgo: orphaned mark runs with no base are still flagged", () => {
  const marks = [0x0301, 0x0302, 0x0303, 0x0304, 0x0305].map((cp) => String.fromCodePoint(cp)).join("");
  const { findings } = scanText(marks);
  expect(findings.filter((f) => f.name === ZALGO_RUN_NAME).length).toBe(1);
  expect(findings[0].description).toContain("no base character");
});

test("zalgo: runs on adjacent base characters are separate findings", () => {
  const marks = [0x0301, 0x0302, 0x0303, 0x0304].map((cp) => String.fromCodePoint(cp)).join("");
  const { findings } = scanText(`a${marks}b${marks}`);
  expect(findings.filter((f) => f.name === ZALGO_RUN_NAME).length).toBe(2);
});

// ── Detector toggles and context ──────────────────────────────────────────────

test("scanner: detectors can be disabled", () => {
  const { findings } = scanText(`x${NBSP}`, { catalogue: false });
  expect(findings.length).toBe(0);
});

test("scanner: context rendering attaches escaped window", () => {
  const finding = only(`hello ${NBSP}world`, { contextRadius: 5 });
  expect(finding.context_escaped).toContain("⟦U+00A0 NBSP⟧");
});

test("scanner: findings sort by byte offset", () => {
  const { findings } = scanText(`${NBSP}a${String.fromCodePoint(0x7f)}`);
  expect(findings.length).toBe(2);
  expect(findings[0].byte_offset).toBeLessThan(findings[1].byte_offset);
});
