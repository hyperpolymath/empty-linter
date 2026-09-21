// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Jonathan D.A. Jewell

import { expect, test } from "bun:test";
import { escapeScalar, escapedContext, renderVisible } from "../src/core/Render.bun.js";

const NBSP = String.fromCodePoint(0x00a0);
const ZWSP = String.fromCodePoint(0x200b);

test("escapeScalar: ASCII prints verbatim; flagged chars get named markers", () => {
  expect(escapeScalar("a")).toBe("a");
  expect(escapeScalar(" ")).toBe(" ");
  expect(escapeScalar(NBSP)).toBe("⟦U+00A0 NBSP⟧");
  expect(escapeScalar(ZWSP)).toBe("⟦U+200B ZWSP⟧");
});

test("escapeScalar: unflagged non-ASCII visible text prints verbatim", () => {
  expect(escapeScalar("é")).toBe("é");
  expect(escapeScalar("中")).toBe("中");
});

test("escapedContext: window is ±radius scalars around the finding", () => {
  const text = `0123456789abcdef${NBSP}0123456789abcdef`;
  const index = 16;
  const ctx = escapedContext(text, index, 4);
  expect(ctx).toBe("…cdef⟦U+00A0 NBSP⟧0123…");
});

test("escapedContext: no ellipses at boundaries", () => {
  const text = `ab${NBSP}cd`;
  const ctx = escapedContext(text, 2, 10);
  expect(ctx).toBe("ab⟦U+00A0 NBSP⟧cd");
});

test("escapedContext: newline and tab render as marks", () => {
  const text = `a\nb\t${NBSP}c`;
  const ctx = escapedContext(text, 4, 10);
  expect(ctx).toBe("a⏎b⇥⟦U+00A0 NBSP⟧c");
});

test("renderVisible: show-formatting-marks over a whole buffer", () => {
  const text = `ab ${NBSP}\ncd\te`;
  const rendered = renderVisible(text);
  expect(rendered).toBe(`ab·⟦U+00A0 NBSP⟧⏎\ncd→e`);
});

test("renderVisible: deterministic and spaces-toggleable", () => {
  const text = "a b";
  expect(renderVisible(text)).toBe("a·b");
  expect(renderVisible(text, { showSpaces: false })).toBe("a b");
});

test("renderVisible: trailing newline keeps the final mark", () => {
  expect(renderVisible("hi\n")).toBe("hi⏎\n");
});

test("renderVisible: clean ASCII is just itself with space marks", () => {
  expect(renderVisible("plain text")).toBe("plain·text");
});
