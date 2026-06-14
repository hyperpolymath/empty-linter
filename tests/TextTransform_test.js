// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Jonathan D.A. Jewell <j.d.a.jewell@open.ac.uk>
import { assertEquals, assertNotEquals } from "jsr:@std/assert";
import {
  default_options, transform, transform_default,
  get_metrics, metrics_to_string,
  check_constraints, format_for_html, format_for_js,
} from "../src/core/TextTransform.deno.js";
import { LF, CRLF } from "../stdlib/SafeWhitespace.deno.js";

Deno.test("TextTransform: transform trims lines when option set", () => {
  const opts = { ...default_options(), trim_document: false, ensure_final_newline: false };
  const result = transform("  hello  \n  world  ", opts);
  assertEquals(result.includes("  hello"), false);
});

Deno.test("TextTransform: transform collapses spaces", () => {
  const opts = { ...default_options(), trim_document: false, ensure_final_newline_opt: false, collapse_spaces_opt: true };
  const result = transform("hello    world", opts);
  assertEquals(result.includes("    "), false);
});

Deno.test("TextTransform: transform normalizes CRLF to LF", () => {
  const opts = { ...default_options(), target_line_ending: LF };
  const result = transform("line1\r\nline2\r\nline3", opts);
  assertEquals(result.includes("\r\n"), false);
  assertEquals(result.includes("\r"), false);
});

Deno.test("TextTransform: transform normalizes LF to CRLF", () => {
  const opts = { ...default_options(), target_line_ending: CRLF, ensure_final_newline_opt: false };
  const result = transform("line1\nline2", opts);
  assertEquals(result.includes("\r\n"), true);
});

Deno.test("TextTransform: transform collapses excess blank lines", () => {
  const opts = { ...default_options(), max_blank_lines: 1, ensure_final_newline: false };
  const result = transform("para1\n\n\n\n\npara2", opts);
  assertEquals(result.includes("\n\n\n"), false);
});

Deno.test("TextTransform: transform ensures final newline", () => {
  const opts = { ...default_options(), ensure_final_newline: true };
  assertEquals(transform("no newline", opts).endsWith("\n"), true);
});

Deno.test("TextTransform: transform_default returns a string", () => {
  const result = transform_default("  test  ");
  assertEquals(typeof result, "string");
});

Deno.test("TextTransform: get_metrics counts chars", () => {
  assertEquals(get_metrics("Hello World").chars, 11);
});

Deno.test("TextTransform: get_metrics counts words", () => {
  assertEquals(get_metrics("Hello World Test").words, 3);
});

Deno.test("TextTransform: get_metrics counts lines", () => {
  assertEquals(get_metrics("Line 1\nLine 2\nLine 3").lines, 3);
});

Deno.test("TextTransform: metrics_to_string includes char count", () => {
  const m = get_metrics("Hello World");
  const s = metrics_to_string(m);
  assertEquals(s.includes("11"), true);
});

Deno.test("TextTransform: check_constraints detects char limit exceeded", () => {
  const c = { max_chars: { tag: "Some", value: 5 }, max_words: { tag: "None" }, max_lines: { tag: "None" }, max_bytes: { tag: "None" } };
  const violations = check_constraints("This is a long string", c);
  assertEquals(violations.length > 0, true);
});

Deno.test("TextTransform: check_constraints passes when within limit", () => {
  const c = { max_chars: { tag: "Some", value: 100 }, max_words: { tag: "None" }, max_lines: { tag: "None" }, max_bytes: { tag: "None" } };
  assertEquals(check_constraints("Short", c).length, 0);
});

Deno.test("TextTransform: check_constraints detects word limit exceeded", () => {
  const c = { max_chars: { tag: "None" }, max_words: { tag: "Some", value: 3 }, max_lines: { tag: "None" }, max_bytes: { tag: "None" } };
  const violations = check_constraints("one two three four five", c);
  assertEquals(violations.length > 0, true);
});

Deno.test("TextTransform: check_constraints detects line limit exceeded", () => {
  const c = { max_chars: { tag: "None" }, max_words: { tag: "None" }, max_lines: { tag: "Some", value: 2 }, max_bytes: { tag: "None" } };
  const violations = check_constraints("a\nb\nc\nd", c);
  assertEquals(violations.length > 0, true);
});

Deno.test("TextTransform: format_for_html escapes < and >", () => {
  const result = format_for_html("<script>xss</script>");
  assertEquals(result.includes("<script>"), false);
  assertEquals(result.includes("&lt;"), true);
});

Deno.test("TextTransform: format_for_html escapes &", () => {
  assertEquals(format_for_html("a & b").includes("&amp;"), true);
});

Deno.test("TextTransform: format_for_js escapes newlines", () => {
  const result = format_for_js("line1\nline2");
  assertEquals(result.includes("\\n"), true);
});

Deno.test("TextTransform: format_for_js escapes double quotes", () => {
  const result = format_for_js('say "hello"');
  assertEquals(result.includes('\\"'), true);
});
