// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Jonathan D.A. Jewell

import { expect, test } from "bun:test";
import { exactEntries, forCodePoint, hex, utf8Bytes, utf8Hex, utf8Length, CATALOGUE_VERSION } from "../src/core/UnicodeData.bun.js";

// ── Legacy minimum-gate catalogue is preserved exactly ────────────────────────

const LEGACY = [
  [0x0000, "NULL", "critical", "mechanical"],
  [0x00a0, "NBSP", "error", "mechanical"],
  [0x200b, "ZWSP", "error", "mechanical"],
  [0xfeff, "BOM", "warning", "mechanical"],
  [0x00ad, "SHY", "info", "ambiguous"],
  [0x200e, "LRM", "info", "ambiguous"],
  [0x200f, "RLM", "info", "ambiguous"],
  [0x2060, "WJ", "info", "ambiguous"],
  [0x200c, "ZWNJ", "warning", "semantic"],
  [0x200d, "ZWJ", "warning", "semantic"],
];

for (const [cp, name, severity, safety] of LEGACY) {
  test(`catalogue: U+${hex(cp)} is ${name} (${severity}/${safety})`, () => {
    const def = forCodePoint(cp);
    expect(def).not.toBeNull();
    expect(def.name).toBe(name);
    expect(def.severity).toBe(severity);
    expect(def.safety).toBe(safety);
  });
}

test("catalogue: semantic joiners are never marked for removal", () => {
  for (const cp of [0x200c, 0x200d]) {
    const def = forCodePoint(cp);
    expect(def.fix.kind).toBe("keep");
  }
});

// ── Detector expansion families (issue #74) ───────────────────────────────────

test("catalogue: unsafe C0 controls flagged, text whitespace permitted", () => {
  for (const cp of [0x09, 0x0a, 0x0d]) expect(forCodePoint(cp)).toBeNull();
  expect(forCodePoint(0x07).name).toBe("C0_CONTROL");
  expect(forCodePoint(0x1b).name).toBe("C0_CONTROL");
  expect(forCodePoint(0x7f).name).toBe("DELETE");
});

test("catalogue: C1 controls flagged with their abbreviations", () => {
  expect(forCodePoint(0x85).name).toBe("C1_NEL");
  expect(forCodePoint(0x9b).name).toBe("C1_CSI");
  expect(forCodePoint(0x80).category).toBe("Cc");
});

test("catalogue: bidi overrides/isolates flagged (Trojan Source class)", () => {
  for (const cp of [0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066, 0x2067, 0x2068, 0x2069]) {
    const def = forCodePoint(cp);
    expect(def).not.toBeNull();
    expect(def.safety).toBe("ambiguous");
  }
  expect(forCodePoint(0x202e).name).toBe("RLO");
  expect(forCodePoint(0x202e).severity).toBe("critical");
  expect(forCodePoint(0x2069).name).toBe("PDI");
});

test("catalogue: Unicode separators and exotic spaces", () => {
  expect(forCodePoint(0x2028).name).toBe("LS");
  expect(forCodePoint(0x2028).category).toBe("Zl");
  expect(forCodePoint(0x2029).category).toBe("Zp");
  expect(forCodePoint(0x2007).name).toBe("FIGURE SPACE");
  expect(forCodePoint(0x3000).name).toBe("IDEOGRAPHIC SPACE");
  expect(forCodePoint(0x1680).name).toBe("OGHAM SPACE");
  for (let cp = 0x2000; cp <= 0x200a; cp += 1) expect(forCodePoint(cp)).not.toBeNull();
});

test("catalogue: tag characters range", () => {
  expect(forCodePoint(0xe0001).name).toBe("LANGUAGE TAG");
  expect(forCodePoint(0xe0041).name).toBe("TAG CHARACTER");
  expect(forCodePoint(0xe0041).unicode_name).toContain("LATIN CAPITAL LETTER A");
  expect(forCodePoint(0xe007f).name).toBe("CANCEL TAG");
  expect(forCodePoint(0xe0000)).toBeNull();
  expect(forCodePoint(0xe0080)).toBeNull();
});

test("catalogue: variation selectors are semantic, never removed", () => {
  expect(forCodePoint(0xfe0f).name).toBe("VS16");
  expect(forCodePoint(0xfe0f).safety).toBe("semantic");
  expect(forCodePoint(0xfe0f).fix.kind).toBe("keep");
  expect(forCodePoint(0xe0100).name).toBe("VS17");
  expect(forCodePoint(0xe01ef).name).toBe("VS256");
  expect(forCodePoint(0xe01ef).safety).toBe("semantic");
});

test("catalogue: object/interlinear markers, replacement char, fillers", () => {
  expect(forCodePoint(0xfffc).name).toBe("ORC");
  expect(forCodePoint(0xfffd).name).toBe("REPLACEMENT CHAR");
  expect(forCodePoint(0xfffd).severity).toBe("error"); // corruption evidence
  expect(forCodePoint(0xfff9).name).toBe("IAA");
  expect(forCodePoint(0xfffb).name).toBe("IAT");
  expect(forCodePoint(0x3164).name).toBe("HANGUL FILLER");
  expect(forCodePoint(0x2800).name).toBe("BRAILLE BLANK");
  expect(forCodePoint(0x115f).name).toBe("HANGUL CHOSEONG FILLER");
});

test("catalogue: deprecated format controls and invisible math operators", () => {
  expect(forCodePoint(0x206a).name).toBe("ISS");
  expect(forCodePoint(0x206f).name).toBe("NODS");
  expect(forCodePoint(0x2061).name).toBe("FUNCTION APPLICATION");
  expect(forCodePoint(0x2062).safety).toBe("semantic");
  expect(forCodePoint(0x2064).name).toBe("INVISIBLE PLUS");
});

test("catalogue: script format controls and CGJ", () => {
  expect(forCodePoint(0x0600).name).toBe("ARABIC NUMBER SIGN");
  expect(forCodePoint(0x061c).name).toBe("ALM");
  expect(forCodePoint(0x070f).name).toBe("SAM");
  expect(forCodePoint(0x180e).category).toBe("Cf"); // Unicode 14 reclassification
  expect(forCodePoint(0x034f).name).toBe("CGJ");
  expect(forCodePoint(0x034f).safety).toBe("semantic");
});

test("catalogue: noncharacters flagged incl. per-plane endings", () => {
  expect(forCodePoint(0xfdd0).name).toBe("NONCHARACTER");
  expect(forCodePoint(0xfdef).name).toBe("NONCHARACTER");
  expect(forCodePoint(0xfffe).name).toBe("REVERSED BOM");
  expect(forCodePoint(0xffff).name).toBe("NONCHARACTER");
  expect(forCodePoint(0x1fffe).name).toBe("NONCHARACTER");
  expect(forCodePoint(0x10ffff).name).toBe("NONCHARACTER");
  expect(forCodePoint(0x1fffd)).toBeNull(); // a real code point: PASS
});

test("catalogue: musical/shorthand/Egyptian notation controls are semantic", () => {
  expect(forCodePoint(0x1d173).name).toBe("MUSICAL FORMAT");
  expect(forCodePoint(0x1d173).safety).toBe("semantic");
  expect(forCodePoint(0x1bca0).name).toBe("SHORTHAND FORMAT");
  expect(forCodePoint(0x13430).name).toBe("EGYPTIAN FORMAT");
  expect(forCodePoint(0x110bd).name).toBe("KAITHI NUMBER SIGN");
});

// ── Clean characters never flagged (planted-negative catalogue checks) ────────

test("catalogue: ordinary text and common punctuation are clean", () => {
  for (const cp of [0x41, 0x61, 0x30, 0x2e, 0x20, 0x27, 0xe9, 0x3b1, 0x4e2d, 0x1f600]) {
    expect(forCodePoint(cp)).toBeNull();
  }
});

// ── UTF-8 helpers ─────────────────────────────────────────────────────────────

test("utf-8: byte sequences are exact", () => {
  expect(utf8Bytes(0x00)).toEqual([0x00]);
  expect(utf8Bytes(0x7f)).toEqual([0x7f]);
  expect(utf8Bytes(0xa0)).toEqual([0xc2, 0xa0]);
  expect(utf8Bytes(0x200d)).toEqual([0xe2, 0x80, 0x8d]);
  expect(utf8Bytes(0x1f600)).toEqual([0xf0, 0x9f, 0x98, 0x80]);
  expect(utf8Hex(0xfe0f)).toBe("EF B8 8F");
  expect(utf8Length(0xe0001)).toBe(4);
});

test("catalogue entries are frozen (defaults cannot be mutated downstream)", () => {
  const def = forCodePoint(0x00a0);
  expect(Object.isFrozen(def)).toBe(true);
  expect(() => { def.severity = "info"; }).toThrow();
  expect(exactEntries().length).toBeGreaterThan(50);
  expect(typeof CATALOGUE_VERSION).toBe("string");
});
