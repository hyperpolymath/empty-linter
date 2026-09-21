// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Jonathan D.A. Jewell
//
// TextTransform.bun.js — whitespace transformation profiles and workspace
// constraints. This replaces the TODO PathHandler/TextTransform stubs with an
// implemented, tested path.
//
// Transforms run ONLY on the apply-to-copy repair path. Audit never mutates,
// and nothing here ever runs against scanner input.
//
// Every transformation reports what it did, so the provenance record can list
// it. Profiles resolve from validated settings; constraint checks produce
// findings-shaped violations so they flow through the normal report/JSON
// machinery.

const LINE_ENDING_TEXT = { LF: "\n", CRLF: "\r\n", CR: "\r" };

/**
 * Apply a transform profile to text.
 *
 * @param {string} text Input text (already in the repair copy domain).
 * @param {object} profile Validated profile from Settings.
 * @returns {{ text: string, changes: Array<{kind: string, detail: number|boolean}> }}
 */
export function applyProfile(text, profile) {
  const changes = [];
  let out = text;

  if (profile.normalize_line_endings) {
    const target = LINE_ENDING_TEXT[profile.target_line_ending] ?? "\n";
    const before = out;
    out = out.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    if (target !== "\n") out = out.replace(/\n/g, target);
    if (out !== before) changes.push({ kind: "normalize_line_endings", detail: profile.target_line_ending });
  }

  const eol = profile.normalize_line_endings
    ? (LINE_ENDING_TEXT[profile.target_line_ending] ?? "\n")
    : detectDominantEol(out);

  let lines = out.split(eol);

  if (profile.trim_lines) {
    let trimmed = 0;
    lines = lines.map((line) => {
      const t = line.replace(/[ \t]+$/u, "");
      if (t !== line) trimmed += 1;
      return t;
    });
    if (trimmed > 0) changes.push({ kind: "trim_lines", detail: trimmed });
  }

  if (profile.collapse_spaces) {
    let collapsed = 0;
    lines = lines.map((line) => {
      // Preserve leading indentation; collapse interior runs of 2+ spaces.
      const indent = /^[ \t]*/u.exec(line)[0];
      const body = line.slice(indent.length);
      const next = body.replace(/  +/gu, " ");
      if (next !== body) collapsed += 1;
      return indent + next;
    });
    if (collapsed > 0) changes.push({ kind: "collapse_spaces", detail: collapsed });
  }

  if (Number.isInteger(profile.max_blank_lines)) {
    let removed = 0;
    const capped = [];
    let blankRun = 0;
    for (const line of lines) {
      if (line.trim() === "") {
        blankRun += 1;
        if (blankRun > profile.max_blank_lines) {
          removed += 1;
          continue;
        }
      } else {
        blankRun = 0;
      }
      capped.push(line);
    }
    lines = capped;
    if (removed > 0) changes.push({ kind: "max_blank_lines", detail: removed });
  }

  if (profile.trim_document) {
    let start = 0;
    let end = lines.length;
    while (start < end && lines[start].trim() === "") start += 1;
    while (end > start && lines[end - 1].trim() === "") end -= 1;
    const removed = lines.length - (end - start);
    lines = lines.slice(start, end);
    if (removed > 0) changes.push({ kind: "trim_document", detail: removed });
  }

  out = lines.join(eol);

  if (profile.ensure_final_newline && out.length > 0 && !out.endsWith(eol)) {
    out += eol;
    changes.push({ kind: "ensure_final_newline", detail: true });
  }

  return { text: out, changes };
}

function detectDominantEol(text) {
  const crlf = (text.match(/\r\n/g) ?? []).length;
  const lf = (text.match(/(?<!\r)\n/g) ?? []).length;
  return crlf > lf ? "\r\n" : "\n";
}

/**
 * Check text against a workspace constraint set.
 *
 * @param {string} text
 * @param {object} constraints { max_chars?, max_words?, max_lines? }
 * @param {string} workspaceName for messages
 * @returns {object[]} findings-shaped violations (severity warning, safety
 * semantic, fix keep — constraints are policy, not corruption).
 */
export function checkConstraints(text, constraints, workspaceName = "workspace") {
  const violations = [];
  const push = (kind, actual, max) => violations.push({
    code_point: null,
    utf8_hex: null,
    name: `CONSTRAINT_${kind.toUpperCase()}`,
    unicode_name: `${workspaceName} constraint violation`,
    category: "policy",
    severity: "warning",
    safety: "semantic",
    fix: { kind: "keep" },
    description: `${workspaceName}: ${kind} ${actual} exceeds maximum ${max}`,
    line: null,
    column: null,
    byte_offset: null,
    scalar_index: null,
    context_escaped: undefined,
  });

  if (Number.isInteger(constraints.max_chars)) {
    const chars = [...text].length;
    if (chars > constraints.max_chars) {
      push("chars", chars, constraints.max_chars);
    }
  }
  if (Number.isInteger(constraints.max_words)) {
    const words = text.trim() === "" ? 0 : text.trim().split(/\s+/u).length;
    if (words > constraints.max_words) {
      push("words", words, constraints.max_words);
    }
  }
  if (Number.isInteger(constraints.max_lines)) {
    const lines = text.split("\n").length;
    if (lines > constraints.max_lines) {
      push("lines", lines, constraints.max_lines);
    }
  }
  return violations;
}
