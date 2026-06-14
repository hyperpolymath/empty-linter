// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Jonathan D.A. Jewell <j.d.a.jewell@open.ac.uk>
import { assertEquals } from "jsr:@std/assert";
import {
  LF, CRLF, CR,
  remove_invisibles, normalize_line_endings,
  collapse_spaces, collapse_blank_lines,
  trim_start, trim_end, ensure_final_newline,
  detect_invisibles,
} from "../stdlib/SafeWhitespace.deno.js";

Deno.test("SafeWhitespace: trim_start removes leading whitespace", () => {
  assertEquals(trim_start("  hello"), "hello");
  assertEquals(trim_start("\t\nhello"), "hello");
  assertEquals(trim_start("hello"), "hello");
});

Deno.test("SafeWhitespace: trim_end removes trailing whitespace", () => {
  assertEquals(trim_end("hello  "), "hello");
  assertEquals(trim_end("hello\t\n"), "hello");
  assertEquals(trim_end("hello"), "hello");
});

Deno.test("SafeWhitespace: collapse_spaces reduces multiple spaces", () => {
  assertEquals(collapse_spaces("hello    world"), "hello world");
  assertEquals(collapse_spaces("a  b  c"), "a b c");
});

Deno.test("SafeWhitespace: collapse_spaces preserves single spaces", () => {
  assertEquals(collapse_spaces("hello world"), "hello world");
});

Deno.test("SafeWhitespace: collapse_blank_lines reduces excess blank lines", () => {
  const result = collapse_blank_lines("para1\n\n\n\npara2", 1);
  assertEquals(result.includes("\n\n\n"), false);
});

Deno.test("SafeWhitespace: normalize_line_endings converts CRLF to LF", () => {
  const result = normalize_line_endings("line1\r\nline2", LF);
  assertEquals(result.includes("\r"), false);
});

Deno.test("SafeWhitespace: normalize_line_endings converts LF to CRLF", () => {
  const result = normalize_line_endings("line1\nline2", CRLF);
  assertEquals(result.includes("\r\n"), true);
});

Deno.test("SafeWhitespace: ensure_final_newline adds newline when missing", () => {
  assertEquals(ensure_final_newline("hello").endsWith("\n"), true);
});

Deno.test("SafeWhitespace: ensure_final_newline idempotent when present", () => {
  const result = ensure_final_newline("hello\n");
  assertEquals(result, "hello\n");
});

Deno.test("SafeWhitespace: remove_invisibles strips known invisible chars", () => {
  const result = remove_invisibles("​﻿hello");
  assertEquals(result.includes("​"), false);
  assertEquals(result.includes("﻿"), false);
});

Deno.test("SafeWhitespace: detect_invisibles finds NBSP", () => {
  const found = detect_invisibles("hello world");
  assertEquals(found.length, 1);
  assertEquals(found[0], 0xa0);
});

Deno.test("SafeWhitespace: detect_invisibles empty for clean string", () => {
  assertEquals(detect_invisibles("hello world").length, 0);
});

Deno.test("SafeWhitespace: LineEnding constants have correct tags", () => {
  assertEquals(LF.tag, "LF");
  assertEquals(CRLF.tag, "CRLF");
  assertEquals(CR.tag, "CR");
});
