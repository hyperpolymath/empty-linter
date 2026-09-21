// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Jonathan D.A. Jewell
//
// Report.bun.js — assemble and format scan results.
//
// Three formats, all stable and pinned by tests:
//   text  the human report (positions, UTF-8 bytes, names, context);
//   json  the diagnostic.v1 record per file (machine consumers);
//   hex   compact code-point listing (dotmatrix-style).
//
// Severity filtering and threshold logic live here so the CLI, the CI shim,
// and the TUI all rank findings identically.

import { SCHEMA_IDS } from "./Repair.bun.js";
import { CATALOGUE_VERSION, hex } from "./UnicodeData.bun.js";
import { TOOL_NAME, TOOL_VERSION } from "./Version.bun.js";

export const SEVERITY_RANK = new Map([["info", 1], ["warning", 2], ["error", 3], ["critical", 4]]);
export const THRESHOLDS = new Set(["info", "warning", "error", "critical"]);

export function severityRank(severity) {
  return SEVERITY_RANK.get(severity) ?? 0;
}

export function atOrAbove(finding, threshold) {
  return severityRank(finding.severity) >= severityRank(threshold);
}

/**
 * Assemble the diagnostic.v1 record for one scanned file.
 */
export function diagnosticRecord({ path, findings, scannedScalars, inputSha256 = null, scannerErrors = [], now = new Date() }) {
  const record = {
    schema: SCHEMA_IDS.diagnostic,
    tool: { name: TOOL_NAME, version: TOOL_VERSION },
    catalogue_version: CATALOGUE_VERSION,
    path,
    generated_at: now.toISOString(),
    findings: findings.map(stripInternal),
    stats: {
      scanned_scalars: scannedScalars,
      finding_count: findings.length,
      scanner_errors: scannerErrors,
    },
  };
  if (inputSha256 !== null) record.input_sha256 = inputSha256;
  return record;
}

function stripInternal(finding) {
  const out = { ...finding };
  delete out.catalogue_version;
  delete out.cluster_scalars;
  delete out.combining_marks;
  if (out.context_escaped === undefined) delete out.context_escaped;
  return out;
}

/** One line of the human report for a finding. */
export function formatFindingLine(path, finding) {
  const position = finding.line === null
    ? "-"
    : `${finding.line}:${finding.column}`;
  const bytes = finding.utf8_hex === null ? "-" : finding.utf8_hex;
  const codePoint = finding.code_point === null ? "-" : `U+${hex(finding.code_point)}`;
  return `${path}:${position}: ${finding.severity.toUpperCase()} ${finding.name} ${codePoint} [${bytes}] (${finding.safety})`;
}

/** The multi-line human detail block, including escaped context. */
export function formatFindingDetail(finding) {
  const lines = [];
  if (finding.unicode_name) lines.push(`    ${finding.unicode_name} · category ${finding.category}`);
  if (finding.description) lines.push(`    ${finding.description}`);
  if (finding.context_escaped) lines.push(`    context: ${finding.context_escaped}`);
  return lines.join("\n");
}

/**
 * Text report for a whole run.
 * @param {Array<{path, findings, scannedScalars}>} files
 */
export function formatTextReport(files, { verbose = true } = {}) {
  const lines = [];
  for (const file of files) {
    for (const finding of file.findings) {
      lines.push(formatFindingLine(file.path, finding));
      if (verbose) {
        const detail = formatFindingDetail(finding);
        if (detail.length > 0) lines.push(detail);
      }
    }
  }
  return lines.join("\n");
}

/** Compact code-point listing, one finding per line. */
export function formatHexReport(files) {
  const lines = [];
  for (const file of files) {
    for (const finding of file.findings) {
      const cp = finding.code_point === null ? "----" : hex(finding.code_point);
      lines.push(`0x${cp} [${finding.name}] ${file.path} L:${finding.line ?? "-"} C:${finding.column ?? "-"} B:${finding.byte_offset ?? "-"}`);
    }
  }
  return lines.join("\n");
}

/** GitHub Actions workflow-command annotation (only emitted under CI). */
export function githubAnnotation(path, finding, blocking) {
  const level = blocking ? "error" : "warning";
  const cp = finding.code_point === null ? finding.name : `U+${hex(finding.code_point)}`;
  const message = `${finding.name} ${cp} (${finding.severity})`;
  const line = finding.line ?? 1;
  const col = finding.column ?? 1;
  return `::${level} file=${path},line=${line},col=${col}::${escapeWorkflowData(message)}`;
}

function escapeWorkflowData(value) {
  return String(value).replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
}
