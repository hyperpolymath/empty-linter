// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Jonathan D.A. Jewell
//
// reference-consumer.bun.js — the tested starting point for downstream
// adapters (Formatrix Docs, Docmatrix, Blocky Writer, Berrywiki, ProgBlocks).
//
// It does the two things every honest adapter must do:
//   1. VALIDATE the records it reads against the shipped diagnostic schema —
//      a producer-side breaking change fails loudly here, not in a consumer;
//   2. render a small consumer-facing summary without ever trusting positions
//      or text blindly (all dynamic text is escaped for Markdown).

import { readFileSync } from "node:fs";
import { assertSchemaSupported, validate } from "../../src/core/SchemaValidator.bun.js";

const DIAGNOSTIC_SCHEMA = JSON.parse(
  readFileSync(new URL("../../schemas/diagnostic.v1.json", import.meta.url), "utf-8"),
);
assertSchemaSupported(DIAGNOSTIC_SCHEMA);

export class AdapterError extends Error {}

/**
 * @param {unknown} data parsed JSON — an array of diagnostic.v1 records or a single record
 * @returns {{ markdown: string, records: number, findings: number, errors: string[] }}
 */
export function consumeDiagnostics(data) {
  const records = Array.isArray(data) ? data : [data];
  const errors = [];
  for (const [index, record] of records.entries()) {
    for (const problem of validate(record, DIAGNOSTIC_SCHEMA, `record[${index}]`)) {
      errors.push(problem);
    }
  }
  if (errors.length > 0) {
    throw new AdapterError(
      `producer output does not satisfy diagnostic.v1.json:\n  - ${errors.join("\n  - ")}\n` +
      `Refusing to consume: adapters must reject unversioned or breaking output loudly.`,
    );
  }

  const lines = ["# Empty-linter findings", ""];
  let findings = 0;
  for (const record of records) {
    lines.push(`## ${md(record.path)}`);
    lines.push("");
    lines.push(`${record.findings.length} finding(s) · catalogue ${md(record.catalogue_version)} · scanned ${record.generated_at}`);
    lines.push("");
    if (record.findings.length > 0) {
      lines.push("| Severity | Name | Position | Safety | Description |");
      lines.push("|---|---|---|---|---|");
      for (const finding of record.findings) {
        findings += 1;
        const position = finding.line === null || finding.line === undefined
          ? "—"
          : `${finding.line}:${finding.column}`;
        lines.push(
          `| ${finding.severity} | ${md(finding.name)} | ${position} | ${md(finding.safety)} | ${md(finding.description)} |`,
        );
      }
      lines.push("");
    }
  }
  return { markdown: `${lines.join("\n")}\n`, records: records.length, findings, errors };
}

// Markdown-escape dynamic content: producer text must never inject structure.
function md(value) {
  return String(value).replace(/[|\\`*_[\]<>]/g, (ch) => `\\${ch}`).replace(/\s+/g, " ").trim();
}

if (import.meta.main) {
  const [path] = process.argv.slice(2);
  if (!path) {
    console.error("usage: bun run adapters/reference-consumer/reference-consumer.bun.js <diagnostics.json>");
    process.exit(2);
  }
  let data;
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- CLI-given path
    data = JSON.parse(readFileSync(path, "utf-8"));
  } catch (error) {
    console.error(`reference-consumer: cannot read ${path}: ${error.message}`);
    process.exit(2);
  }
  try {
    const { markdown } = consumeDiagnostics(data);
    console.log(markdown);
  } catch (error) {
    if (error instanceof AdapterError) {
      console.error(error.message);
      process.exit(1);
    }
    throw error;
  }
}
