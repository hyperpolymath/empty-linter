// SPDX-License-Identifier: PMPL-1.0-or-later
// SPDX-FileCopyrightText: 2025 Hyperpolymath
//
// Tests for TextTransform module
// 🏆 Idris Inside - Testing proven SafeString/SafeWhitespace integration

open TextTransform

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

let () = denoTest("TextTransform: transform trims lines", () => {
  let input = "  hello  \n  world  "
  let result = transform(input, { ...defaultOptions, trimDocument: false, ensureFinalNewline: false })

  Assert.assertEquals(Js.String2.includes(result, "  hello"), false)
})

let () = denoTest("TextTransform: transform collapses spaces", () => {
  let input = "hello    world"
  let result = transform(input, { ...defaultOptions, trimDocument: false, ensureFinalNewline: false })

  Assert.assertEquals(Js.String2.includes(result, "    "), false)
})

let () = denoTest("TextTransform: transform normalizes line endings", () => {
  let input = "line1\r\nline2\rline3\n"
  let result = transform(input, { ...defaultOptions, targetLineEnding: Proven_SafeWhitespace.LF })

  Assert.assertEquals(Js.String2.includes(result, "\r\n"), false)
  Assert.assertEquals(Js.String2.includes(result, "\r"), false)
})

let () = denoTest("TextTransform: transform collapses blank lines", () => {
  let input = "para1\n\n\n\n\npara2"
  let result = transform(input, { ...defaultOptions, maxBlankLines: 1, ensureFinalNewline: false })

  // Should have at most 2 consecutive newlines (1 blank line)
  Assert.assertEquals(Js.String2.includes(result, "\n\n\n"), false)
})

let () = denoTest("TextTransform: transform ensures final newline", () => {
  let input = "no newline at end"
  let result = transform(input, { ...defaultOptions, ensureFinalNewline: true })

  Assert.assertEquals(Js.String2.endsWith(result, "\n"), true)
})

let () = denoTest("TextTransform: transformDefault uses default options", () => {
  let input = "  test  "
  let result = transformDefault(input)

  Assert.assertExists(result)
})

let () = denoTest("TextTransform: getMetrics counts chars correctly", () => {
  let input = "Hello World"
  let m = getMetrics(input)

  Assert.assertEquals(m.chars, 11)
})

let () = denoTest("TextTransform: getMetrics counts words correctly", () => {
  let input = "Hello World Test"
  let m = getMetrics(input)

  Assert.assertEquals(m.words, 3)
})

let () = denoTest("TextTransform: getMetrics counts lines correctly", () => {
  let input = "Line 1\nLine 2\nLine 3"
  let m = getMetrics(input)

  Assert.assertEquals(m.lines, 3)
})

let () = denoTest("TextTransform: getMetrics counts paragraphs correctly", () => {
  let input = "Para 1\n\nPara 2\n\nPara 3"
  let m = getMetrics(input)

  Assert.assertEquals(m.paragraphs, 3)
})

let () = denoTest("TextTransform: metricsToString produces output", () => {
  let m = { chars: 100, charsNoWhitespace: 80, words: 20, lines: 5, paragraphs: 2 }
  let str = metricsToString(m)

  Assert.assertEquals(Js.String2.includes(str, "100"), true)
  Assert.assertEquals(Js.String2.includes(str, "20"), true)
})

let () = denoTest("TextTransform: checkConstraints detects char limit", () => {
  let content = "This is a test string"
  let constraints = { maxChars: Some(10), maxWords: None, maxLines: None, maxBytes: None }
  let violations = checkConstraints(content, constraints)

  Assert.assertEquals(Belt.Array.length(violations) > 0, true)
})

let () = denoTest("TextTransform: checkConstraints passes within limit", () => {
  let content = "Short"
  let constraints = { maxChars: Some(100), maxWords: None, maxLines: None, maxBytes: None }
  let violations = checkConstraints(content, constraints)

  Assert.assertEquals(Belt.Array.length(violations), 0)
})

let () = denoTest("TextTransform: checkConstraints detects word limit", () => {
  let content = "one two three four five six seven eight nine ten eleven"
  let constraints = { maxChars: None, maxWords: Some(5), maxLines: None, maxBytes: None }
  let violations = checkConstraints(content, constraints)

  Assert.assertEquals(Belt.Array.length(violations) > 0, true)
})

let () = denoTest("TextTransform: checkConstraints detects line limit", () => {
  let content = "1\n2\n3\n4\n5\n6"
  let constraints = { maxChars: None, maxWords: None, maxLines: Some(3), maxBytes: None }
  let violations = checkConstraints(content, constraints)

  Assert.assertEquals(Belt.Array.length(violations) > 0, true)
})

let () = denoTest("TextTransform: getWorkspace finds twitter", () => {
  switch getWorkspace("twitter") {
  | Some(ws) =>
    Assert.assertEquals(ws.name, "twitter")
  | None =>
    Assert.assertExists(None)  // Should find it
  }
})

let () = denoTest("TextTransform: getWorkspace is case-insensitive", () => {
  switch getWorkspace("TWITTER") {
  | Some(ws) =>
    Assert.assertEquals(ws.name, "twitter")
  | None =>
    Assert.assertExists(None)
  }
})

let () = denoTest("TextTransform: getWorkspace returns None for unknown", () => {
  switch getWorkspace("nonexistent") {
  | Some(_) =>
    Assert.assertExists(None)  // Should not find it
  | None =>
    Assert.assertExists(None)  // Expected
  }
})

let () = denoTest("TextTransform: applyWorkspace transforms content", () => {
  let content = "  Hello  World  "
  switch applyWorkspace(content, "twitter") {
  | Ok((transformed, _)) =>
    Assert.assertNotEquals(transformed, content)
  | Error(_) =>
    Assert.assertExists(None)
  }
})

let () = denoTest("TextTransform: applyWorkspace returns violations", () => {
  // Create content that exceeds Twitter's 280 char limit
  let content = Js.String2.repeat("a", 300)
  switch applyWorkspace(content, "twitter") {
  | Ok((_, violations)) =>
    Assert.assertEquals(Belt.Array.length(violations) > 0, true)
  | Error(_) =>
    Assert.assertExists(None)
  }
})

let () = denoTest("TextTransform: applyWorkspace errors for unknown workspace", () => {
  switch applyWorkspace("test", "nonexistent") {
  | Ok(_) =>
    Assert.assertExists(None)  // Should error
  | Error(msg) =>
    Assert.assertEquals(Js.String2.includes(msg, "Unknown"), true)
  }
})

let () = denoTest("TextTransform: formatForHtml escapes HTML entities", () => {
  let input = "<script>alert('xss')</script>"
  let result = formatForHtml(input)

  Assert.assertEquals(Js.String2.includes(result, "<script>"), false)
  Assert.assertEquals(Js.String2.includes(result, "&lt;"), true)
})

let () = denoTest("TextTransform: formatForJs escapes JS strings", () => {
  let input = "line1\nline2"
  let result = formatForJs(input)

  Assert.assertEquals(Js.String2.includes(result, "\\n"), true)
})

let () = denoTest("TextTransform: strictOptions has lower maxBlankLines", () => {
  Assert.assertEquals(strictOptions.maxBlankLines < defaultOptions.maxBlankLines, true)
})

let () = denoTest("TextTransform: minimalOptions preserves formatting", () => {
  Assert.assertEquals(minimalOptions.trimLines, false)
  Assert.assertEquals(minimalOptions.collapseSpaces, false)
})
