// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Jonathan D.A. Jewell
//
// sync-downstream.js — cross-dependency drift control.
//
// The userscript and the VS Code extension each render an artefact table for
// their own runtime. Those tables used to drift from the detector source of
// truth. This script regenerates the marked regions of both files from
// src/core/UnicodeData.bun.js, so every downstream surface reports the same
// names, severities, and descriptions as the audited engine.
//
// Usage:
//   bun run scripts/sync-downstream.js          # rewrite marked regions
//   bun run scripts/sync-downstream.js --check  # exit 1 if any region drifted
//
// Regions are delimited by:
//   // BEGIN GENERATED: empty-linter-artifact-table (family)
//   // END GENERATED
// where family is "base" (single table) or "bidirectional".

import { readFileSync, writeFileSync } from "node:fs";
import { exactEntries } from "../src/core/UnicodeData.bun.js";
import { TOOL_VERSION } from "../src/core/Version.bun.js";

const BEGIN = "// BEGIN GENERATED: empty-linter-artifact-table";
const END = "// END GENERATED";

const BIDI_NAMES = new Set(["LRE", "RLE", "PDF", "LRO", "RLO", "LRI", "RLI", "FSI", "PDI"]);

const TARGETS = [
  {
    path: "userscript/empty-linter.user.js",
    tables: [
      { name: "ARTIFACTS", family: "base" },
      { name: "BIDI_ARTIFACTS", family: "bidirectional" },
    ],
  },
  {
    path: "vscode-extension/src/extension.js",
    tables: [
      { name: "ARTIFACTS", family: "base" },
      { name: "BIDI_ARTIFACTS", family: "bidirectional" },
    ],
  },
];

/**
 * Render one table in the historical style of the downstream files.
 * @param {"base"|"bidirectional"} family
 */
export function renderTable(name, family) {
  const entries = exactEntries()
    .filter((e) => (family === "bidirectional" ? BIDI_NAMES.has(e.name) : !BIDI_NAMES.has(e.name)))
    .sort((a, b) => a.code_point - b.code_point);

  const lines = [`${BEGIN} (${family})`, `const ${name} = {`];
  for (const entry of entries) {
    const key = `0x${entry.code_point.toString(16).toUpperCase()}`;
    const description = entry.description.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
    lines.push(
      `    ${key}: { name: '${entry.name}', severity: '${entry.severity}', description: '${description}' },`,
    );
  }
  lines.push(`};`, END);
  return lines.join("\n");
}

/** Replace the marked region for one table inside file content. */
export function spliceRegion(content, rendered, family) {
  const beginLine = `${BEGIN} (${family})`;
  const start = content.indexOf(beginLine);
  if (start === -1) throw new Error(`missing marker "${beginLine}"`);
  const end = content.indexOf(END, start);
  if (end === -1) throw new Error(`missing "${END}" after ${beginLine}`);
  const endLine = end + END.length;
  return content.slice(0, start) + rendered + content.slice(endLine);
}

function processFile(target, checkOnly) {
  let content = readFileSync(target.path, "utf-8");
  const original = content;
  for (const table of target.tables) {
    content = spliceRegion(content, renderTable(table.name, table.family), table.family);
  }
  if (content === original) return { path: target.path, changed: false };
  if (checkOnly) return { path: target.path, changed: true };
  writeFileSync(target.path, content);
  return { path: target.path, changed: true };
}

function checkToolVersion() {
  const pkg = JSON.parse(readFileSync("package.json", "utf-8"));
  if (pkg.version !== TOOL_VERSION) {
    console.error(`sync-downstream: TOOL_VERSION ${TOOL_VERSION} != package.json version ${pkg.version}`);
    return false;
  }
  return true;
}

const checkOnly = process.argv.includes("--check");
let drift = 0;
if (!checkToolVersion()) drift += 1;
for (const target of TARGETS) {
  const result = processFile(target, checkOnly);
  if (result.changed) {
    drift += 1;
    console.log(`${result.path}: ${checkOnly ? "DRIFTED (run sync-downstream.js)" : "updated"}`);
  } else {
    console.log(`${result.path}: in sync`);
  }
}
if (checkOnly && drift > 0) {
  console.error(`sync-downstream: ${drift} drift item(s)`);
  process.exit(1);
}
if (!checkOnly && drift === 0) console.log("sync-downstream: everything already in sync");
