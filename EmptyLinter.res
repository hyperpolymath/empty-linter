// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2025 Hyperpolymath
//
// EmptyLinter - Main entry point for invisible artifact detection
// 🏆 Idris Inside - Powered by mathematically verified proven library

open ByteDetector
open PathHandler
open TextTransform

/** Deno file system bindings */
@val external readTextFile: string => promise<string> = "Deno.readTextFile"
@val external writeTextFile: (string, string) => promise<unit> = "Deno.writeTextFile"

/** Lint configuration */
type lintConfig = {
  minSeverity: severity,
  autoFix: bool,
  outputFormat: string, // "text" | "json" | "hex"
  workspace: option<string>,
}

/** Default lint configuration */
let defaultConfig: lintConfig = {
  minSeverity: Warning,
  autoFix: false,
  outputFormat: "text",
  workspace: None,
}

/** Lint result for a single file */
type lintResult = {
  path: string,
  artifacts: array<artifact>,
  metrics: metrics,
  fixed: bool,
  fixCount: int,
}

/** Audit a single file for invisible artifacts
 *
 * 🏆 Idris Inside: Uses proven ByteDetector for detection
 */
let auditFile = async (filePath: string, config: lintConfig): lintResult => {
  // Validate path using proven SafePath
  switch validate(filePath) {
  | None => {
      path: filePath,
      artifacts: [],
      metrics: { chars: 0, charsNoWhitespace: 0, words: 0, lines: 0, paragraphs: 0 },
      fixed: false,
      fixCount: 0,
    }
  | Some(validPath) =>
    let pathStr = unwrap(validPath)
    let content = await readTextFile(pathStr)

    // Scan for artifacts using proven SafeHex
    let allArtifacts = scan(content)
    let filteredArtifacts = filterBySeverity(allArtifacts, config.minSeverity)

    // Get metrics
    let contentMetrics = getMetrics(content)

    // Apply fixes if requested
    let (finalContent, fixCount) = if config.autoFix {
      applyFixes(content)
    } else {
      (content, 0)
    }

    // Write fixed content if changes were made
    if fixCount > 0 {
      await writeTextFile(pathStr, finalContent)
    }

    {
      path: pathStr,
      artifacts: filteredArtifacts,
      metrics: contentMetrics,
      fixed: fixCount > 0,
      fixCount: fixCount,
    }
  }
}

/** Audit and transform content for a specific workspace
 *
 * 🏆 Idris Inside: Uses proven SafeString for output formatting
 */
let auditForWorkspace = async (filePath: string, workspaceName: string): result<(lintResult, array<string>), string> => {
  switch validate(filePath) {
  | None => Error("Invalid file path")
  | Some(validPath) =>
    let pathStr = unwrap(validPath)
    let content = await readTextFile(pathStr)

    switch applyWorkspace(content, workspaceName) {
    | Error(e) => Error(e)
    | Ok((transformed, violations)) =>
      let artifacts = scan(transformed)
      let contentMetrics = getMetrics(transformed)

      let result = {
        path: pathStr,
        artifacts: artifacts,
        metrics: contentMetrics,
        fixed: content != transformed,
        fixCount: if content != transformed { 1 } else { 0 },
      }

      Ok((result, violations))
    }
  }
}

/** Format lint result for output
 *
 * 🏆 Idris Inside: Uses proven SafeString.escapeHtml for XSS-proof output
 */
let formatResult = (result: lintResult, format: string): string => {
  switch format {
  | "json" =>
    let artifactsJson = result.artifacts->Belt.Array.map(a => {
      `{"line":${Belt.Int.toString(a.line)},"column":${Belt.Int.toString(a.column)},"name":"${a.name}","severity":"${
        switch a.severity {
        | Critical => "critical"
        | Error => "error"
        | Warning => "warning"
        | Info => "info"
        }
      }","hex":"${a.hexValue}"}`
    })
    `{"path":"${result.path}","artifacts":[${Js.Array2.joinWith(artifactsJson, ",")}],"metrics":{"chars":${Belt.Int.toString(result.metrics.chars)},"words":${Belt.Int.toString(result.metrics.words)},"lines":${Belt.Int.toString(result.metrics.lines)}},"fixed":${result.fixed ? "true" : "false"},"fixCount":${Belt.Int.toString(result.fixCount)}}`

  | "hex" =>
    scanToHex(result.path)

  | _ => // "text" default
    let header = `File: ${result.path}\n`
    let metricsLine = `Metrics: ${metricsToString(result.metrics)}\n`
    let artifactsReport = generateReport(result.artifacts)
    let fixLine = if result.fixed {
      `\nFixed ${Belt.Int.toString(result.fixCount)} artifact(s)`
    } else {
      ""
    }
    header ++ metricsLine ++ artifactsReport ++ fixLine
  }
}

/** Quick audit with console output (for CLI usage) */
let quickAudit = async (filePath: string): unit => {
  let result = await auditFile(filePath, defaultConfig)
  Js.log(formatResult(result, "text"))
}

/** Batch audit multiple files */
let batchAudit = async (filePaths: array<string>, config: lintConfig): array<lintResult> => {
  let results = ref([])

  for i in 0 to Belt.Array.length(filePaths) - 1 {
    let path = Belt.Array.getUnsafe(filePaths, i)
    let result = await auditFile(path, config)
    results := Belt.Array.concat(results.contents, [result])
  }

  results.contents
}

/** Summary statistics for batch results */
type batchSummary = {
  totalFiles: int,
  totalArtifacts: int,
  criticalCount: int,
  errorCount: int,
  warningCount: int,
  infoCount: int,
  filesFixed: int,
  totalFixCount: int,
}

/** Generate summary from batch results */
let summarizeBatch = (results: array<lintResult>): batchSummary => {
  let summary = ref({
    totalFiles: Belt.Array.length(results),
    totalArtifacts: 0,
    criticalCount: 0,
    errorCount: 0,
    warningCount: 0,
    infoCount: 0,
    filesFixed: 0,
    totalFixCount: 0,
  })

  results->Belt.Array.forEach(r => {
    let s = summary.contents
    summary := {
      ...s,
      totalArtifacts: s.totalArtifacts + Belt.Array.length(r.artifacts),
      filesFixed: s.filesFixed + (if r.fixed { 1 } else { 0 }),
      totalFixCount: s.totalFixCount + r.fixCount,
    }

    r.artifacts->Belt.Array.forEach(a => {
      let s = summary.contents
      switch a.severity {
      | Critical => summary := { ...s, criticalCount: s.criticalCount + 1 }
      | Error => summary := { ...s, errorCount: s.errorCount + 1 }
      | Warning => summary := { ...s, warningCount: s.warningCount + 1 }
      | Info => summary := { ...s, infoCount: s.infoCount + 1 }
      }
    })
  })

  summary.contents
}

/** Format batch summary */
let formatSummary = (s: batchSummary): string => {
  `Empty Linter Summary
═══════════════════════════════════════
Files scanned:    ${Belt.Int.toString(s.totalFiles)}
Total artifacts:  ${Belt.Int.toString(s.totalArtifacts)}
  Critical:       ${Belt.Int.toString(s.criticalCount)}
  Error:          ${Belt.Int.toString(s.errorCount)}
  Warning:        ${Belt.Int.toString(s.warningCount)}
  Info:           ${Belt.Int.toString(s.infoCount)}
Files fixed:      ${Belt.Int.toString(s.filesFixed)}
Total fixes:      ${Belt.Int.toString(s.totalFixCount)}
═══════════════════════════════════════`
}
