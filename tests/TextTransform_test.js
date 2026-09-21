// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Jonathan D.A. Jewell
//
// TextTransform replaces the TODO TextTransform.affine module with an
// implemented path. Transforms only ever run on the apply-to-copy domain.

import { expect, test } from "bun:test";
import { applyProfile, checkConstraints } from "../src/core/TextTransform.bun.js";
import { defaultSettings } from "../src/core/Settings.bun.js";

const profiles = defaultSettings().transform;

test("profile: trim_lines removes trailing spaces and tabs", () => {
  const { text, changes } = applyProfile("a  \nb\t\n", { ...profiles.minimal, trim_lines: true });
  expect(text.startsWith("a\nb\n")).toBe(true);
  expect(changes[0]).toEqual({ kind: "trim_lines", detail: 2 });
});

test("profile: collapse_spaces preserves indentation", () => {
  const { text } = applyProfile("    code   goes   here  \n", { ...profiles.minimal, trim_lines: false, collapse_spaces: true });
  expect(text).toBe("    code goes here \n"); // indent kept; interior/trailing runs → one space
});

test("profile: normalize_line_endings to LF", () => {
  const { text, changes } = applyProfile("a\r\nb\rc\n", profiles.default);
  expect(text).toContain("a\nb\nc\n");
  expect(changes.some((c) => c.kind === "normalize_line_endings")).toBe(true);
});

test("profile: max_blank_lines caps runs", () => {
  const input = "a\n\n\n\n\nb\n";
  const { text } = applyProfile(input, { ...profiles.minimal, max_blank_lines: 1, trim_document: false });
  expect(text).toBe("a\n\nb\n");
});

test("profile: strict profile composition", () => {
  const input = "\n\n  hello   world  \n\n\n\n\nbye\r\n";
  const { text } = applyProfile(input, profiles.strict);
  // trim_lines keeps leading indent, collapses blanks to 1, trims document ends.
  expect(text).toBe("  hello world\n\nbye\n");
});

test("profile: ensure_final_newline adds exactly one", () => {
  const { text } = applyProfile("no newline", profiles.default);
  expect(text.endsWith("\n")).toBe(true);
  expect(text.endsWith("\n\n")).toBe(false);
});

test("profile: CRLF target honoured", () => {
  const { text } = applyProfile("a\nb\n", { ...profiles.minimal, normalize_line_endings: true, target_line_ending: "CRLF" });
  expect(text).toContain("a\r\nb\r\n");
});

test("constraints: empty displayed results and limit breaches are findings", () => {
  const violations = checkConstraints("one two three\nfour\n", { max_words: 2, max_lines: 1, max_chars: 5 }, "twitter");
  expect(violations.length).toBe(3);
  expect(violations.every((v) => v.severity === "warning")).toBe(true);
  expect(violations.every((v) => v.safety === "semantic")).toBe(true);
  expect(violations[0].description).toContain("twitter");
});

test("constraints: within limits is clean", () => {
  expect(checkConstraints("short text\n", { max_words: 8, max_lines: 2, max_chars: 100 }, "x").length).toBe(0);
});
