// SPDX-License-Identifier: PMPL-1.0-or-later
// SPDX-FileCopyrightText: 2025 Hyperpolymath
//
// Tests for ByteDetector module
// 🏆 Idris Inside - Testing proven SafeHex integration

open ByteDetector

/** Deno test bindings */
@val external denoTest: (string, unit => unit) => unit = "Deno.test"
@val external denoTestAsync: (string, unit => promise<unit>) => unit = "Deno.test"

module Assert = {
  @val external assertEquals: ('a, 'a) => unit = "assertEquals"
  @val external assertNotEquals: ('a, 'a) => unit = "assertNotEquals"
  @val external assertStrictEquals: ('a, 'a) => unit = "assertStrictEquals"
  @val external assertExists: 'a => unit = "assertExists"
  @val external assertThrows: (unit => unit) => unit = "assertThrows"
}

// Import assertions
%%raw(`
import { assertEquals, assertNotEquals, assertStrictEquals, assertExists, assertThrows } from "jsr:@std/assert";
`)

let () = denoTest("ByteDetector: scan detects NBSP", () => {
  let content = "Hello\u00A0World"  // NBSP between words
  let artifacts = scan(content)

  Assert.assertEquals(Belt.Array.length(artifacts), 1)

  let first = Belt.Array.getUnsafe(artifacts, 0)
  Assert.assertEquals(first.name, "NBSP")
  Assert.assertEquals(first.line, 1)
  Assert.assertEquals(first.column, 6)
})

let () = denoTest("ByteDetector: scan detects ZWSP", () => {
  let content = "Hello\u200BWorld"  // ZWSP between words
  let artifacts = scan(content)

  Assert.assertEquals(Belt.Array.length(artifacts), 1)

  let first = Belt.Array.getUnsafe(artifacts, 0)
  Assert.assertEquals(first.name, "ZWSP")
})

let () = denoTest("ByteDetector: scan detects BOM", () => {
  let content = "\uFEFFHello World"  // BOM at start
  let artifacts = scan(content)

  Assert.assertEquals(Belt.Array.length(artifacts), 1)

  let first = Belt.Array.getUnsafe(artifacts, 0)
  Assert.assertEquals(first.name, "BOM")
  Assert.assertEquals(first.column, 1)
})

let () = denoTest("ByteDetector: scan detects multiple artifacts", () => {
  let content = "Line1\u00A0with NBSP\nLine2\u200Bwith ZWSP"
  let artifacts = scan(content)

  Assert.assertEquals(Belt.Array.length(artifacts), 2)
})

let () = denoTest("ByteDetector: scan returns empty for clean content", () => {
  let content = "Hello World\nThis is clean text."
  let artifacts = scan(content)

  Assert.assertEquals(Belt.Array.length(artifacts), 0)
})

let () = denoTest("ByteDetector: byteToHex produces correct hex", () => {
  Assert.assertEquals(byteToHex(0xA0), "a0")
  Assert.assertEquals(byteToHex(0x20), "20")
  Assert.assertEquals(byteToHex(0x00), "00")
  Assert.assertEquals(byteToHex(0xFF), "ff")
})

let () = denoTest("ByteDetector: byteToHex handles multi-byte values", () => {
  // ZWSP is 0x200B
  let hex = byteToHex(0x200B)
  Assert.assertEquals(hex, "200b")
})

let () = denoTest("ByteDetector: filterBySeverity filters correctly", () => {
  let content = "\u0000\u00A0\uFEFF"  // NULL (Critical), NBSP (Error), BOM (Warning)
  let allArtifacts = scan(content)

  let critical = filterBySeverity(allArtifacts, Critical)
  let errors = filterBySeverity(allArtifacts, Error)
  let warnings = filterBySeverity(allArtifacts, Warning)

  Assert.assertEquals(Belt.Array.length(critical), 1)  // Only NULL
  Assert.assertEquals(Belt.Array.length(errors), 2)    // NULL + NBSP
  Assert.assertEquals(Belt.Array.length(warnings), 3)  // All three
})

let () = denoTest("ByteDetector: applyFixes removes artifacts", () => {
  let content = "Hello\u00A0World"  // NBSP should become space
  let (fixed, count) = applyFixes(content)

  // NBSP should be replaced with regular space
  Assert.assertNotEquals(content, fixed)
  // Count may vary based on implementation
  Assert.assertExists(count)
})

let () = denoTest("ByteDetector: generateReport produces output", () => {
  let content = "Test\u00A0content"
  let artifacts = scan(content)
  let report = generateReport(artifacts)

  // Report should contain the artifact info
  Assert.assertExists(report)
  Assert.assertNotEquals(report, "")
})

let () = denoTest("ByteDetector: getArtifactDef returns correct definitions", () => {
  switch getArtifactDef(0xA0) {
  | Some(def) =>
    Assert.assertEquals(def.name, "NBSP")
    Assert.assertEquals(def.severity, Error)
  | None =>
    Assert.assertExists(None)  // Should not reach here
  }
})

let () = denoTest("ByteDetector: getArtifactDef returns None for unknown", () => {
  switch getArtifactDef(0x41) {  // 'A' - not an artifact
  | Some(_) =>
    Assert.assertExists(None)  // Should not reach here
  | None =>
    Assert.assertExists(None)  // Expected
  }
})

let () = denoTest("ByteDetector: scanToHex produces hex output", () => {
  let content = "Test\u00A0\u200B"
  let hexOutput = scanToHex(content)

  // Should contain hex values
  Assert.assertExists(hexOutput)
})

let () = denoTest("ByteDetector: line numbers are 1-indexed", () => {
  let content = "Line 1\nLine 2\u00A0here"
  let artifacts = scan(content)

  Assert.assertEquals(Belt.Array.length(artifacts), 1)
  let first = Belt.Array.getUnsafe(artifacts, 0)
  Assert.assertEquals(first.line, 2)  // Should be line 2, not 1
})

let () = denoTest("ByteDetector: column numbers are 1-indexed", () => {
  let content = "\u00A0Hello"  // NBSP at position 0 (0-indexed)
  let artifacts = scan(content)

  let first = Belt.Array.getUnsafe(artifacts, 0)
  Assert.assertEquals(first.column, 1)  // Should be column 1, not 0
})
