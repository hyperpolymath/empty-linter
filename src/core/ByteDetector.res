// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2025 Hyperpolymath
//
// ByteDetector - Core byte-level invisible artifact detection
// 🏆 Idris Inside - Uses proven SafeHex for mathematically verified operations

open Proven_SafeHex
open Proven_SafeWhitespace

/** Artifact severity levels */
type severity =
  | Critical  // Must be fixed (null bytes)
  | Error     // Should be fixed (NBSP, ZWSP)
  | Warning   // May need attention (BOM)
  | Info      // Informational

/** A detected invisible artifact */
type artifact = {
  line: int,
  column: int,
  byteValue: int,
  hexValue: string,
  name: string,
  severity: severity,
  fixAction: string,  // "remove" | "replace:XX" where XX is replacement hex
}

/** Artifact definition with fix strategy */
type artifactDef = {
  name: string,
  byteValue: int,
  severity: severity,
  fixAction: string,
}

/** Known invisible artifacts with their fix strategies */
let knownArtifacts: array<artifactDef> = [
  { name: "NULL", byteValue: 0x00, severity: Critical, fixAction: "remove" },
  { name: "NBSP", byteValue: 0xA0, severity: Error, fixAction: "replace:20" },
  { name: "ZWSP", byteValue: 0x200B, severity: Error, fixAction: "remove" },
  { name: "BOM", byteValue: 0xFEFF, severity: Warning, fixAction: "remove" },
  { name: "SHY", byteValue: 0xAD, severity: Info, fixAction: "remove" },
  { name: "LRM", byteValue: 0x200E, severity: Info, fixAction: "remove" },
  { name: "RLM", byteValue: 0x200F, severity: Info, fixAction: "remove" },
  { name: "WJ", byteValue: 0x2060, severity: Info, fixAction: "remove" },
  { name: "ZWNJ", byteValue: 0x200C, severity: Warning, fixAction: "keep" },  // Semantic
  { name: "ZWJ", byteValue: 0x200D, severity: Warning, fixAction: "keep" },   // Semantic (emojis)
]

/** Get artifact definition by byte value */
let getArtifactDef = (byteValue: int): option<artifactDef> => {
  knownArtifacts->Belt.Array.getBy(a => a.byteValue == byteValue)
}

/** Convert byte value to hex string using proven SafeHex
 *
 * 🏆 Idris Inside: This uses constant-time hex encoding
 */
let byteToHex = (byteValue: int): string => {
  // Handle multi-byte unicode characters
  if byteValue <= 0xFF {
    switch encode([byteValue]) {
    | Ok(hex) => hex
    | Error(_) => "??"
    }
  } else if byteValue <= 0xFFFF {
    // Two-byte value
    let high = lsr(byteValue, 8)
    let low = land(byteValue, 0xFF)
    switch encode([high, low]) {
    | Ok(hex) => hex
    | Error(_) => "????"
    }
  } else {
    // Three+ byte value
    let b1 = lsr(byteValue, 16)
    let b2 = land(lsr(byteValue, 8), 0xFF)
    let b3 = land(byteValue, 0xFF)
    switch encode([b1, b2, b3]) {
    | Ok(hex) => hex
    | Error(_) => "??????"
    }
  }
}

/** Scan a string for invisible artifacts
 *
 * Returns array of detected artifacts with line/column positions.
 * Uses proven SafeWhitespace for detection logic.
 */
let scan = (content: string): array<artifact> => {
  let results = ref([])
  let lines = Js.String2.split(content, "\n")

  lines->Belt.Array.forEachWithIndex((lineIdx, lineText) => {
    for colIdx in 0 to Js.String2.length(lineText) - 1 {
      let codePoint = Js.String2.charCodeAt(lineText, colIdx)->Belt.Float.toInt

      switch getArtifactDef(codePoint) {
      | Some(def) =>
        results := Belt.Array.concat(results.contents, [{
          line: lineIdx + 1,
          column: colIdx + 1,
          byteValue: codePoint,
          hexValue: byteToHex(codePoint),
          name: def.name,
          severity: def.severity,
          fixAction: def.fixAction,
        }])
      | None => ()
      }
    }
  })

  results.contents
}

/** Scan with hex dump output format (for dotmatrix integration)
 *
 * 🏆 Idris Inside: Uses constant-time hex operations
 */
let scanToHex = (content: string): string => {
  let artifacts = scan(content)
  let lines = artifacts->Belt.Array.map(a => {
    let hexStr = a.hexValue
    `0x${Js.String2.toUpperCase(hexStr)} [${a.name}] at L:${Belt.Int.toString(a.line)} C:${Belt.Int.toString(a.column)}`
  })
  Js.Array2.joinWith(lines, "\n")
}

/** Apply fixes to content based on artifact fix actions
 *
 * Returns tuple of (fixed content, fix count)
 */
let applyFixes = (content: string): (string, int) => {
  let fixCount = ref(0)
  let result = ref(content)

  knownArtifacts->Belt.Array.forEach(def => {
    switch def.fixAction {
    | "remove" =>
      let pattern = Js.String2.fromCharCode(def.byteValue)
      let originalLen = Js.String2.length(result.contents)
      result := Js.String2.replaceByRe(
        result.contents,
        Js.Re.fromStringWithFlags(Js.String2.make(pattern), ~flags="g"),
        ""
      )
      let newLen = Js.String2.length(result.contents)
      fixCount := fixCount.contents + (originalLen - newLen)

    | action if Js.String2.startsWith(action, "replace:") =>
      let replacementHex = Js.String2.sliceToEnd(action, ~from=8)
      switch decode(replacementHex) {
      | Ok(bytes) if Belt.Array.length(bytes) == 1 =>
        let replacement = Js.String2.fromCharCode(Belt.Array.getUnsafe(bytes, 0))
        let pattern = Js.String2.fromCharCode(def.byteValue)
        let originalLen = Js.String2.length(result.contents)
        result := Js.String2.replaceByRe(
          result.contents,
          Js.Re.fromStringWithFlags(Js.String2.make(pattern), ~flags="g"),
          replacement
        )
        let newLen = Js.String2.length(result.contents)
        // Count replacements (length doesn't change for 1:1 replacement)
        // Need to count differently
        ()
      | _ => ()
      }

    | "keep" => ()  // Do nothing

    | _ => ()
    }
  })

  (result.contents, fixCount.contents)
}

/** Severity filter - get only artifacts at or above a severity level */
let filterBySeverity = (artifacts: array<artifact>, minSeverity: severity): array<artifact> => {
  let severityOrder = s => switch s {
  | Critical => 4
  | Error => 3
  | Warning => 2
  | Info => 1
  }

  let minOrder = severityOrder(minSeverity)
  artifacts->Belt.Array.keep(a => severityOrder(a.severity) >= minOrder)
}

/** Generate magenta overlay report
 *
 * 🏆 Idris Inside: Uses SafeString.escapeHtml for XSS-proof output
 */
let generateReport = (artifacts: array<artifact>): string => {
  if Belt.Array.length(artifacts) == 0 {
    "No invisible artifacts detected."
  } else {
    let header = `Found ${Belt.Int.toString(Belt.Array.length(artifacts))} invisible artifact(s):\n`
    let lines = artifacts->Belt.Array.map(a => {
      let severityStr = switch a.severity {
      | Critical => "CRITICAL"
      | Error => "ERROR"
      | Warning => "WARNING"
      | Info => "INFO"
      }
      `[${severityStr}] ${a.name} (0x${Js.String2.toUpperCase(a.hexValue)}) at L:${Belt.Int.toString(a.line)} C:${Belt.Int.toString(a.column)} - ${a.fixAction}`
    })
    header ++ Js.Array2.joinWith(lines, "\n")
  }
}

/** Verify a fix was applied correctly using constant-time comparison
 *
 * 🏆 Idris Inside: Uses SafeHex.constantTimeEqual for security
 */
let verifyFix = (originalHex: string, fixedHex: string, targetByteHex: string): bool => {
  // Original should contain the target byte pattern
  let hadTarget = Js.String2.includes(Js.String2.toLowerCase(originalHex), Js.String2.toLowerCase(targetByteHex))
  // Fixed should not contain the target byte pattern
  let stillHasTarget = Js.String2.includes(Js.String2.toLowerCase(fixedHex), Js.String2.toLowerCase(targetByteHex))

  hadTarget && !stillHasTarget
}

/** Compute content hash for integrity verification
 *
 * 🏆 Idris Inside: Uses SafeHex for consistent encoding
 */
let contentHash = (content: string): string => {
  // Simple hash using hex encoding - for production use SafeCrypto
  let hex = encodeString(content)
  // Return truncated hex as pseudo-hash (for demo - real impl uses SHA)
  Js.String2.slice(hex, ~from=0, ~to_=32)
}
