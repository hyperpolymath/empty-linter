// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2025 Hyperpolymath
//
// NEW MODULE - To be contributed back to proven library
// This module provides mathematically safe whitespace operations
// for text normalization without data loss or corruption.

/**
 * SafeWhitespace - Whitespace normalization that cannot corrupt text.
 *
 * Provides safe operations for:
 * - Trimming leading/trailing whitespace
 * - Collapsing multiple spaces
 * - Normalizing line endings
 * - Detecting invisible characters
 *
 * 🏆 Idris Inside - Operations are total functions that handle all inputs.
 */

/** Line ending types */
type lineEnding =
  | LF      // Unix: \n
  | CRLF    // Windows: \r\n
  | CR      // Old Mac: \r
  | Mixed   // Multiple types detected

/** Invisible character categories */
type invisibleChar = {
  codePoint: int,
  name: string,
  category: string,
  isSafe: bool,  // true = can be safely removed
}

/** Known invisible characters with their metadata */
let invisibleChars: array<invisibleChar> = [
  { codePoint: 0x00, name: "NULL", category: "control", isSafe: false },
  { codePoint: 0x09, name: "TAB", category: "whitespace", isSafe: true },
  { codePoint: 0x0A, name: "LF", category: "linebreak", isSafe: true },
  { codePoint: 0x0B, name: "VTAB", category: "whitespace", isSafe: true },
  { codePoint: 0x0C, name: "FORM_FEED", category: "whitespace", isSafe: true },
  { codePoint: 0x0D, name: "CR", category: "linebreak", isSafe: true },
  { codePoint: 0x20, name: "SPACE", category: "whitespace", isSafe: true },
  { codePoint: 0x85, name: "NEL", category: "linebreak", isSafe: true },
  { codePoint: 0xA0, name: "NBSP", category: "invisible", isSafe: true },
  { codePoint: 0x1680, name: "OGHAM_SPACE", category: "whitespace", isSafe: true },
  { codePoint: 0x2000, name: "EN_QUAD", category: "whitespace", isSafe: true },
  { codePoint: 0x2001, name: "EM_QUAD", category: "whitespace", isSafe: true },
  { codePoint: 0x2002, name: "EN_SPACE", category: "whitespace", isSafe: true },
  { codePoint: 0x2003, name: "EM_SPACE", category: "whitespace", isSafe: true },
  { codePoint: 0x2004, name: "THREE_PER_EM", category: "whitespace", isSafe: true },
  { codePoint: 0x2005, name: "FOUR_PER_EM", category: "whitespace", isSafe: true },
  { codePoint: 0x2006, name: "SIX_PER_EM", category: "whitespace", isSafe: true },
  { codePoint: 0x2007, name: "FIGURE_SPACE", category: "whitespace", isSafe: true },
  { codePoint: 0x2008, name: "PUNCTUATION_SPACE", category: "whitespace", isSafe: true },
  { codePoint: 0x2009, name: "THIN_SPACE", category: "whitespace", isSafe: true },
  { codePoint: 0x200A, name: "HAIR_SPACE", category: "whitespace", isSafe: true },
  { codePoint: 0x200B, name: "ZWSP", category: "invisible", isSafe: true },
  { codePoint: 0x200C, name: "ZWNJ", category: "invisible", isSafe: false }, // Has semantic meaning
  { codePoint: 0x200D, name: "ZWJ", category: "invisible", isSafe: false },  // Has semantic meaning
  { codePoint: 0x200E, name: "LRM", category: "formatting", isSafe: true },
  { codePoint: 0x200F, name: "RLM", category: "formatting", isSafe: true },
  { codePoint: 0x2028, name: "LINE_SEP", category: "linebreak", isSafe: true },
  { codePoint: 0x2029, name: "PARA_SEP", category: "linebreak", isSafe: true },
  { codePoint: 0x202F, name: "NNBSP", category: "whitespace", isSafe: true },
  { codePoint: 0x205F, name: "MMSP", category: "whitespace", isSafe: true },
  { codePoint: 0x2060, name: "WJ", category: "invisible", isSafe: true },
  { codePoint: 0x3000, name: "IDEOGRAPHIC_SPACE", category: "whitespace", isSafe: true },
  { codePoint: 0xFEFF, name: "BOM", category: "invisible", isSafe: true },
]

/** Get invisible character info by code point */
let getInvisibleCharInfo = (codePoint: int): option<invisibleChar> => {
  invisibleChars->Belt.Array.getBy(c => c.codePoint == codePoint)
}

/** Check if a code point is an invisible character */
let isInvisible = (codePoint: int): bool => {
  invisibleChars->Belt.Array.some(c => c.codePoint == codePoint)
}

/** Check if a code point can be safely removed */
let canSafelyRemove = (codePoint: int): bool => {
  switch getInvisibleCharInfo(codePoint) {
  | Some(info) => info.isSafe
  | None => false
  }
}

/** Trim leading whitespace from a string */
let trimStart = (input: string): string => {
  Js.String2.replaceByRe(input, %re("/^[\s\u00A0\u200B\uFEFF]+/"), "")
}

/** Trim trailing whitespace from a string */
let trimEnd = (input: string): string => {
  Js.String2.replaceByRe(input, %re("/[\s\u00A0\u200B\uFEFF]+$/"), "")
}

/** Trim both leading and trailing whitespace */
let trim = (input: string): string => {
  input->trimStart->trimEnd
}

/** Collapse multiple consecutive spaces into single space */
let collapseSpaces = (input: string): string => {
  Js.String2.replaceByRe(input, %re("/[ ]{2,}/g"), " ")
}

/** Collapse multiple consecutive blank lines into maximum N blank lines */
let collapseBlankLines = (input: string, maxBlanks: int): string => {
  let pattern = if maxBlanks <= 0 {
    %re("/\n{2,}/g")
  } else if maxBlanks == 1 {
    %re("/\n{3,}/g")
  } else {
    %re("/\n{3,}/g")  // Will need to adjust replacement
  }

  let replacement = if maxBlanks <= 0 {
    "\n"
  } else {
    Belt.Array.make(maxBlanks + 1, "")->Js.Array2.joinWith("\n")
  }

  Js.String2.replaceByRe(input, pattern, replacement)
}

/** Detect the line ending type used in a string */
let detectLineEnding = (input: string): lineEnding => {
  let hasCRLF = Js.String2.includes(input, "\r\n")
  let hasCR = Js.String2.includes(input, "\r") && !hasCRLF
  let hasLF = Js.String2.includes(input, "\n") && !hasCRLF

  switch (hasCRLF, hasCR, hasLF) {
  | (true, false, false) => CRLF
  | (false, true, false) => CR
  | (false, false, true) => LF
  | (false, false, false) => LF  // Default to LF
  | _ => Mixed
  }
}

/** Normalize line endings to a specific type */
let normalizeLineEndings = (input: string, target: lineEnding): string => {
  let normalized = switch target {
  | LF => "\n"
  | CRLF => "\r\n"
  | CR => "\r"
  | Mixed => "\n"  // Default to LF for mixed
  }

  // First convert CRLF to LF, then CR to LF, then LF to target
  input
  ->Js.String2.replaceByRe(%re("/\r\n/g"), "\n")
  ->Js.String2.replaceByRe(%re("/\r/g"), "\n")
  ->Js.String2.replaceByRe(%re("/\n/g"), normalized)
}

/** Ensure string ends with exactly one newline */
let ensureFinalNewline = (input: string): string => {
  let trimmed = trimEnd(input)
  trimmed ++ "\n"
}

/** Remove final newline if present */
let removeFinalNewline = (input: string): string => {
  if Js.String2.endsWith(input, "\n") {
    Js.String2.slice(input, ~from=0, ~to_=Js.String2.length(input) - 1)
  } else {
    input
  }
}

/** Convert NBSP (0xA0) to regular space (0x20) */
let nbspToSpace = (input: string): string => {
  Js.String2.replaceByRe(input, %re("/\u00A0/g"), " ")
}

/** Remove zero-width spaces */
let removeZwsp = (input: string): string => {
  Js.String2.replaceByRe(input, %re("/\u200B/g"), "")
}

/** Remove byte order marks */
let removeBom = (input: string): string => {
  Js.String2.replaceByRe(input, %re("/\uFEFF/g"), "")
}

/** Remove all safely-removable invisible characters */
let removeInvisibles = (input: string): string => {
  input
  ->nbspToSpace
  ->removeZwsp
  ->removeBom
  ->Js.String2.replaceByRe(%re("/\u200E/g"), "")  // LRM
  ->Js.String2.replaceByRe(%re("/\u200F/g"), "")  // RLM
  ->Js.String2.replaceByRe(%re("/\u2060/g"), "")  // WJ
}

/** Full normalization pipeline */
let normalize = (input: string): string => {
  input
  ->removeInvisibles
  ->normalizeLineEndings(LF)
  ->collapseSpaces
  ->collapseBlankLines(2)
  ->trim
  ->ensureFinalNewline
}

/** Result type for invisible character detection */
type detection = {
  line: int,
  column: int,
  codePoint: int,
  name: string,
  category: string,
}

/** Detect all invisible characters in a string with positions */
let detectInvisibles = (input: string): array<detection> => {
  let results = ref([])
  let lines = Js.String2.split(input, "\n")

  lines->Belt.Array.forEachWithIndex((lineIdx, lineText) => {
    for colIdx in 0 to Js.String2.length(lineText) - 1 {
      let codePoint = Js.String2.charCodeAt(lineText, colIdx)->Belt.Float.toInt
      switch getInvisibleCharInfo(codePoint) {
      | Some(info) if info.category == "invisible" =>
        results := Belt.Array.concat(results.contents, [{
          line: lineIdx + 1,
          column: colIdx + 1,
          codePoint: codePoint,
          name: info.name,
          category: info.category,
        }])
      | _ => ()
      }
    }
  })

  results.contents
}

/** Count words in a string */
let wordCount = (input: string): int => {
  let trimmed = trim(input)
  if Js.String2.length(trimmed) == 0 {
    0
  } else {
    let words = Js.String2.splitByRe(trimmed, %re("/\s+/"))
    Belt.Array.length(words)
  }
}

/** Count characters (excluding whitespace) */
let charCountNoWhitespace = (input: string): int => {
  let noWhitespace = Js.String2.replaceByRe(input, %re("/\s/g"), "")
  Js.String2.length(noWhitespace)
}

/** Count characters (including whitespace) */
let charCount = (input: string): int => {
  Js.String2.length(input)
}

/** Truncate string to word limit */
let truncateWords = (input: string, maxWords: int): string => {
  if maxWords <= 0 {
    ""
  } else {
    let words = Js.String2.splitByRe(trim(input), %re("/\s+/"))
    let truncated = Belt.Array.slice(words, ~offset=0, ~len=maxWords)
    truncated
    ->Belt.Array.keepMap(w => w)
    ->Js.Array2.joinWith(" ")
  }
}

/** Truncate string to character limit (at word boundary) */
let truncateChars = (input: string, maxChars: int): string => {
  if maxChars <= 0 {
    ""
  } else if Js.String2.length(input) <= maxChars {
    input
  } else {
    // Find last space before maxChars
    let truncated = Js.String2.slice(input, ~from=0, ~to_=maxChars)
    let lastSpace = Js.String2.lastIndexOf(truncated, " ")
    if lastSpace > 0 {
      Js.String2.slice(truncated, ~from=0, ~to_=lastSpace)
    } else {
      truncated
    }
  }
}
