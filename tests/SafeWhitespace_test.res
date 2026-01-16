// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2025 Hyperpolymath
//
// Tests for Proven_SafeWhitespace module
// 🏆 Idris Inside - Testing the NEW proven module

open Proven_SafeWhitespace

/** Deno test bindings */
@val external denoTest: (string, unit => unit) => unit = "Deno.test"

module Assert = {
  @val external assertEquals: ('a, 'a) => unit = "assertEquals"
  @val external assertNotEquals: ('a, 'a) => unit = "assertNotEquals"
  @val external assertExists: 'a => unit = "assertExists"
}

// Import assertions
%%raw(`
import { assertEquals, assertNotEquals, assertExists } from "jsr:@std/assert";
`)

// Trim tests

let () = denoTest("SafeWhitespace: trimStart removes leading whitespace", () => {
  Assert.assertEquals(trimStart("  hello"), "hello")
  Assert.assertEquals(trimStart("\t\nhello"), "hello")
  Assert.assertEquals(trimStart("hello"), "hello")
})

let () = denoTest("SafeWhitespace: trimEnd removes trailing whitespace", () => {
  Assert.assertEquals(trimEnd("hello  "), "hello")
  Assert.assertEquals(trimEnd("hello\t\n"), "hello")
  Assert.assertEquals(trimEnd("hello"), "hello")
})

let () = denoTest("SafeWhitespace: trim removes both ends", () => {
  Assert.assertEquals(trim("  hello  "), "hello")
  Assert.assertEquals(trim("\n\thello\t\n"), "hello")
})

let () = denoTest("SafeWhitespace: trim handles NBSP", () => {
  let withNbsp = "\u00A0hello\u00A0"
  let result = trim(withNbsp)
  Assert.assertEquals(result, "hello")
})

let () = denoTest("SafeWhitespace: trim handles ZWSP", () => {
  let withZwsp = "\u200Bhello\u200B"
  let result = trim(withZwsp)
  Assert.assertEquals(result, "hello")
})

// Space collapsing tests

let () = denoTest("SafeWhitespace: collapseSpaces reduces multiple spaces", () => {
  Assert.assertEquals(collapseSpaces("hello    world"), "hello world")
  Assert.assertEquals(collapseSpaces("a  b  c"), "a b c")
})

let () = denoTest("SafeWhitespace: collapseSpaces preserves single spaces", () => {
  Assert.assertEquals(collapseSpaces("hello world"), "hello world")
})

let () = denoTest("SafeWhitespace: collapseBlankLines reduces blank lines", () => {
  let input = "para1\n\n\n\npara2"
  let result = collapseBlankLines(input, 1)
  Assert.assertEquals(Js.String2.includes(result, "\n\n\n"), false)
})

// Line ending tests

let () = denoTest("SafeWhitespace: detectLineEnding detects LF", () => {
  Assert.assertEquals(detectLineEnding("line1\nline2"), LF)
})

let () = denoTest("SafeWhitespace: detectLineEnding detects CRLF", () => {
  Assert.assertEquals(detectLineEnding("line1\r\nline2"), CRLF)
})

let () = denoTest("SafeWhitespace: detectLineEnding detects CR", () => {
  Assert.assertEquals(detectLineEnding("line1\rline2"), CR)
})

let () = denoTest("SafeWhitespace: detectLineEnding detects Mixed", () => {
  Assert.assertEquals(detectLineEnding("line1\nline2\rline3"), Mixed)
})

let () = denoTest("SafeWhitespace: normalizeLineEndings converts to LF", () => {
  let input = "line1\r\nline2\rline3"
  let result = normalizeLineEndings(input, LF)
  Assert.assertEquals(Js.String2.includes(result, "\r"), false)
})

let () = denoTest("SafeWhitespace: normalizeLineEndings converts to CRLF", () => {
  let input = "line1\nline2"
  let result = normalizeLineEndings(input, CRLF)
  Assert.assertEquals(Js.String2.includes(result, "\r\n"), true)
})

// Final newline tests

let () = denoTest("SafeWhitespace: ensureFinalNewline adds newline", () => {
  let input = "hello"
  let result = ensureFinalNewline(input)
  Assert.assertEquals(Js.String2.endsWith(result, "\n"), true)
})

let () = denoTest("SafeWhitespace: ensureFinalNewline doesn't double newline", () => {
  let input = "hello\n\n"
  let result = ensureFinalNewline(input)
  Assert.assertEquals(Js.String2.endsWith(result, "\n\n"), false)
})

let () = denoTest("SafeWhitespace: removeFinalNewline removes newline", () => {
  let input = "hello\n"
  let result = removeFinalNewline(input)
  Assert.assertEquals(Js.String2.endsWith(result, "\n"), false)
})

// Invisible character tests

let () = denoTest("SafeWhitespace: nbspToSpace converts NBSP", () => {
  let input = "hello\u00A0world"
  let result = nbspToSpace(input)
  Assert.assertEquals(result, "hello world")
})

let () = denoTest("SafeWhitespace: removeZwsp removes ZWSP", () => {
  let input = "hello\u200Bworld"
  let result = removeZwsp(input)
  Assert.assertEquals(result, "helloworld")
})

let () = denoTest("SafeWhitespace: removeBom removes BOM", () => {
  let input = "\uFEFFhello"
  let result = removeBom(input)
  Assert.assertEquals(result, "hello")
})

let () = denoTest("SafeWhitespace: removeInvisibles removes all safe invisibles", () => {
  let input = "\u00A0\u200B\uFEFF\u200E\u200Fhello"
  let result = removeInvisibles(input)
  Assert.assertEquals(result, " hello")  // NBSP becomes space
})

// Detection tests

let () = denoTest("SafeWhitespace: isInvisible identifies invisible chars", () => {
  Assert.assertEquals(isInvisible(0xA0), true)   // NBSP
  Assert.assertEquals(isInvisible(0x200B), true) // ZWSP
  Assert.assertEquals(isInvisible(0x41), false)  // 'A'
})

let () = denoTest("SafeWhitespace: canSafelyRemove checks safety", () => {
  Assert.assertEquals(canSafelyRemove(0xA0), true)    // NBSP is safe
  Assert.assertEquals(canSafelyRemove(0x200D), false) // ZWJ is not safe (emojis)
  Assert.assertEquals(canSafelyRemove(0x00), false)   // NULL is not safe
})

let () = denoTest("SafeWhitespace: getInvisibleCharInfo returns info", () => {
  switch getInvisibleCharInfo(0xA0) {
  | Some(info) =>
    Assert.assertEquals(info.name, "NBSP")
    Assert.assertEquals(info.category, "invisible")
  | None =>
    Assert.assertExists(None)
  }
})

let () = denoTest("SafeWhitespace: detectInvisibles finds positions", () => {
  let input = "hello\u00A0world"
  let detections = detectInvisibles(input)
  Assert.assertEquals(Belt.Array.length(detections), 1)
})

// Word/char counting tests

let () = denoTest("SafeWhitespace: wordCount counts words", () => {
  Assert.assertEquals(wordCount("hello world test"), 3)
  Assert.assertEquals(wordCount(""), 0)
  Assert.assertEquals(wordCount("   "), 0)
})

let () = denoTest("SafeWhitespace: charCount counts all chars", () => {
  Assert.assertEquals(charCount("hello"), 5)
  Assert.assertEquals(charCount("hello world"), 11)
})

let () = denoTest("SafeWhitespace: charCountNoWhitespace excludes whitespace", () => {
  Assert.assertEquals(charCountNoWhitespace("hello world"), 10)
  Assert.assertEquals(charCountNoWhitespace("a b c"), 3)
})

// Truncation tests

let () = denoTest("SafeWhitespace: truncateWords limits words", () => {
  let input = "one two three four five"
  let result = truncateWords(input, 3)
  Assert.assertEquals(wordCount(result), 3)
})

let () = denoTest("SafeWhitespace: truncateWords handles edge cases", () => {
  Assert.assertEquals(truncateWords("hello", 0), "")
  Assert.assertEquals(truncateWords("hello world", 10), "hello world")
})

let () = denoTest("SafeWhitespace: truncateChars limits chars", () => {
  let input = "hello world test"
  let result = truncateChars(input, 10)
  Assert.assertEquals(Js.String2.length(result) <= 10, true)
})

let () = denoTest("SafeWhitespace: truncateChars breaks at word boundary", () => {
  let input = "hello world"
  let result = truncateChars(input, 8)
  // Should truncate at "hello" not mid-word
  Assert.assertEquals(result, "hello")
})

// Full normalization test

let () = denoTest("SafeWhitespace: normalize applies full pipeline", () => {
  let input = "\uFEFF  hello\u00A0\u00A0world  \r\n\r\n\r\ntest  "
  let result = normalize(input)

  // Should have no BOM
  Assert.assertEquals(Js.String2.includes(result, "\uFEFF"), false)
  // Should have normalized line endings
  Assert.assertEquals(Js.String2.includes(result, "\r"), false)
  // Should end with single newline
  Assert.assertEquals(Js.String2.endsWith(result, "\n"), true)
})
