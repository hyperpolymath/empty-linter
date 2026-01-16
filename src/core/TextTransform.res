// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2025 Hyperpolymath
//
// TextTransform - Safe text normalization and transformation
// 🏆 Idris Inside - Uses proven SafeString and SafeWhitespace

open Proven_SafeString
open Proven_SafeWhitespace

/** Transformation options */
type transformOptions = {
  trimLines: bool,
  trimDocument: bool,
  collapseSpaces: bool,
  normalizeLineEndings: bool,
  targetLineEnding: lineEnding,
  maxBlankLines: int,
  removeInvisibles: bool,
  ensureFinalNewline: bool,
}

/** Default transformation options */
let defaultOptions: transformOptions = {
  trimLines: true,
  trimDocument: true,
  collapseSpaces: true,
  normalizeLineEndings: true,
  targetLineEnding: LF,
  maxBlankLines: 2,
  removeInvisibles: true,
  ensureFinalNewline: true,
}

/** Strict options (aggressive cleaning) */
let strictOptions: transformOptions = {
  trimLines: true,
  trimDocument: true,
  collapseSpaces: true,
  normalizeLineEndings: true,
  targetLineEnding: LF,
  maxBlankLines: 1,
  removeInvisibles: true,
  ensureFinalNewline: true,
}

/** Minimal options (preserve formatting) */
let minimalOptions: transformOptions = {
  trimLines: false,
  trimDocument: false,
  collapseSpaces: false,
  normalizeLineEndings: true,
  targetLineEnding: LF,
  maxBlankLines: 100,  // Effectively unlimited
  removeInvisibles: true,
  ensureFinalNewline: false,
}

/** Apply transformations based on options
 *
 * 🏆 Idris Inside: Uses proven SafeWhitespace operations
 */
let transform = (content: string, options: transformOptions): string => {
  let result = ref(content)

  // Step 1: Remove invisibles if requested
  if options.removeInvisibles {
    result := removeInvisibles(result.contents)
  }

  // Step 2: Normalize line endings
  if options.normalizeLineEndings {
    result := normalizeLineEndings(result.contents, options.targetLineEnding)
  }

  // Step 3: Trim each line if requested
  if options.trimLines {
    let lines = Js.String2.split(result.contents, "\n")
    let trimmedLines = lines->Belt.Array.map(line => {
      trimEnd(trimStart(line))
    })
    result := Js.Array2.joinWith(trimmedLines, "\n")
  }

  // Step 4: Collapse spaces if requested
  if options.collapseSpaces {
    result := collapseSpaces(result.contents)
  }

  // Step 5: Collapse blank lines
  result := collapseBlankLines(result.contents, options.maxBlankLines)

  // Step 6: Trim document if requested
  if options.trimDocument {
    result := trim(result.contents)
  }

  // Step 7: Ensure final newline if requested
  if options.ensureFinalNewline {
    result := ensureFinalNewline(result.contents)
  }

  result.contents
}

/** Quick transform with default options */
let transformDefault = (content: string): string => {
  transform(content, defaultOptions)
}

/** Transform statistics */
type transformStats = {
  originalLength: int,
  finalLength: int,
  linesRemoved: int,
  spacesCollapsed: int,
  invisiblesRemoved: int,
  lineEndingsNormalized: bool,
}

/** Transform with statistics tracking */
let transformWithStats = (content: string, options: transformOptions): (string, transformStats) => {
  let originalLength = Js.String2.length(content)
  let originalLines = Belt.Array.length(Js.String2.split(content, "\n"))

  // Count invisibles before
  let invisiblesBefore = Belt.Array.length(detectInvisibles(content))

  // Apply transform
  let result = transform(content, options)

  // Calculate stats
  let finalLength = Js.String2.length(result)
  let finalLines = Belt.Array.length(Js.String2.split(result, "\n"))
  let invisiblesAfter = Belt.Array.length(detectInvisibles(result))

  let stats = {
    originalLength: originalLength,
    finalLength: finalLength,
    linesRemoved: originalLines - finalLines,
    spacesCollapsed: originalLength - finalLength,  // Approximation
    invisiblesRemoved: invisiblesBefore - invisiblesAfter,
    lineEndingsNormalized: options.normalizeLineEndings,
  }

  (result, stats)
}

/** Format output for display
 *
 * 🏆 Idris Inside: Uses SafeString.escapeHtml for XSS-proof output
 */
let formatForHtml = (content: string): string => {
  escapeHtml(content)
}

/** Format output for JavaScript embedding
 *
 * 🏆 Idris Inside: Uses SafeString.escapeJs for injection-proof output
 */
let formatForJs = (content: string): string => {
  escapeJs(content)
}

/** Constraint checking */
type constraint_ = {
  maxChars: option<int>,
  maxWords: option<int>,
  maxLines: option<int>,
  maxBytes: option<int>,
}

/** Check if content satisfies constraints */
let checkConstraints = (content: string, constraints: constraint_): array<string> => {
  let violations = ref([])

  switch constraints.maxChars {
  | Some(max) if charCount(content) > max =>
    violations := Belt.Array.concat(violations.contents, [
      `Character limit exceeded: ${Belt.Int.toString(charCount(content))}/${Belt.Int.toString(max)}`
    ])
  | _ => ()
  }

  switch constraints.maxWords {
  | Some(max) if wordCount(content) > max =>
    violations := Belt.Array.concat(violations.contents, [
      `Word limit exceeded: ${Belt.Int.toString(wordCount(content))}/${Belt.Int.toString(max)}`
    ])
  | _ => ()
  }

  switch constraints.maxLines {
  | Some(max) =>
    let lines = Belt.Array.length(Js.String2.split(content, "\n"))
    if lines > max {
      violations := Belt.Array.concat(violations.contents, [
        `Line limit exceeded: ${Belt.Int.toString(lines)}/${Belt.Int.toString(max)}`
      ])
    }
  | None => ()
  }

  violations.contents
}

/** Content metrics for visualization */
type metrics = {
  chars: int,
  charsNoWhitespace: int,
  words: int,
  lines: int,
  paragraphs: int,
}

/** Calculate content metrics */
let getMetrics = (content: string): metrics => {
  let lines = Js.String2.split(content, "\n")
  let paragraphs = Js.String2.split(content, "\n\n")

  {
    chars: charCount(content),
    charsNoWhitespace: charCountNoWhitespace(content),
    words: wordCount(content),
    lines: Belt.Array.length(lines),
    paragraphs: Belt.Array.length(paragraphs),
  }
}

/** Generate metrics summary */
let metricsToString = (m: metrics): string => {
  `${Belt.Int.toString(m.chars)} chars | ${Belt.Int.toString(m.words)} words | ${Belt.Int.toString(m.lines)} lines`
}

/** Workspace preset for form filling */
type workspace = {
  name: string,
  constraints: constraint_,
  transformOptions: transformOptions,
}

/** Pre-defined workspaces for common form targets */
let workspaces: array<workspace> = [
  {
    name: "twitter",
    constraints: { maxChars: Some(280), maxWords: None, maxLines: None, maxBytes: None },
    transformOptions: { ...defaultOptions, maxBlankLines: 0 },
  },
  {
    name: "linkedin",
    constraints: { maxChars: Some(3000), maxWords: Some(500), maxLines: None, maxBytes: None },
    transformOptions: defaultOptions,
  },
  {
    name: "github-issue",
    constraints: { maxChars: Some(65536), maxWords: None, maxLines: None, maxBytes: None },
    transformOptions: minimalOptions,
  },
  {
    name: "jira",
    constraints: { maxChars: Some(32767), maxWords: None, maxLines: Some(100), maxBytes: None },
    transformOptions: defaultOptions,
  },
]

/** Get workspace by name */
let getWorkspace = (name: string): option<workspace> => {
  workspaces->Belt.Array.getBy(w => w.name == Js.String2.toLowerCase(name))
}

/** Apply workspace transformations and check constraints */
let applyWorkspace = (content: string, workspaceName: string): result<(string, array<string>), string> => {
  switch getWorkspace(workspaceName) {
  | None => Error(`Unknown workspace: ${workspaceName}`)
  | Some(ws) =>
    let transformed = transform(content, ws.transformOptions)
    let violations = checkConstraints(transformed, ws.constraints)
    Ok((transformed, violations))
  }
}
