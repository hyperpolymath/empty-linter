// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Jonathan D.A. Jewell
//
// ScannerIO.bun.js — the shared scanning layer behind the stable CI shim
// (scripts/empty-lint-ci.js) and the full CLI (src/cli/Main.bun.js).
//
// Responsibilities:
//   * enumerate files (extension policy, ignored/excluded directories,
//     symlinks skipped, deterministic order);
//   * route container formats (DOCX/PPTX/XLSX/PDF) to the container
//     detectors, everything else to fatal UTF-8 text scanning;
//   * decode fatally: malformed bytes are a scanner ERROR, never a finding
//     (the issue: "Scanner errors must fail distinctly from findings");
//   * apply settings toggles (bidi/tags/variation selectors/zalgo);
//   * never write anything. Audit never mutates input.

import { lstat, readFile, readdir } from "node:fs/promises";
import { extname, join } from "node:path";
import { scanText } from "./ScalarScanner.bun.js";
import { scanContainers, isContainerPath, scanTextExtras } from "../containers/index.js";

export const DEFAULT_EXTENSIONS = new Set([
  ".a2ml", ".adoc", ".affine", ".c", ".cc", ".cpp", ".css", ".csv",
  ".deed", ".ex", ".exs", ".gleam", ".h", ".hpp", ".hs", ".html", ".idr",
  ".ipynb", ".java", ".jl", ".js", ".json", ".jsx", ".k9", ".md", ".ml",
  ".ncl", ".res", ".rs", ".sh", ".svg", ".tex", ".toml", ".ts",
  ".tsx", ".txt", ".v", ".xml", ".yaml", ".yml", ".zig",
]);

export const CONTAINER_EXTENSIONS = new Set([".docx", ".pptx", ".xlsx", ".pdf"]);

export const DEFAULT_IGNORED_DIRECTORIES = new Set([
  ".git", ".lake", "_build", "deps", "external_corpora",
  "node_modules", "target",
]);

const UTF8_DECODER = new TextDecoder("utf-8", {
  fatal: true,
  // Preserve a leading BOM so the detector can report it.
  ignoreBOM: true,
});

export class ScanError extends Error {}

/**
 * Enumerate files to scan under the given paths.
 * @returns {Promise<string[]>} deterministic (path-sorted) list
 * @throws {ScanError} when a path cannot be enumerated
 */
export async function collectFiles(paths, { extensions = null, allFiles = false, ignoredDirectories = DEFAULT_IGNORED_DIRECTORIES } = {}) {
  const files = [];
  const wanted = extensions === null ? DEFAULT_EXTENSIONS : new Set([...extensions].map((e) => e.toLowerCase()));
  for (const path of paths) {
    await collect(path, files, { wanted, allFiles, ignoredDirectories });
  }
  files.sort((a, b) => a.localeCompare(b));
  return files;
}

async function collect(path, files, options) {
  // The caller deliberately grants this local CLI access to each supplied
  // path. Dynamic filesystem arguments are the scanner's trust boundary.
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- intended local CLI path
  let info;
  try {
    info = await lstat(path);
  } catch (error) {
    throw new ScanError(`could not enumerate input: ${path}: ${error.message}`);
  }
  if (info.isSymbolicLink()) return;
  if (info.isFile()) {
    const ext = extname(path).toLowerCase();
    if (CONTAINER_EXTENSIONS.has(ext) || options.allFiles || options.wanted.has(ext)) {
      files.push(path);
    }
    return;
  }
  if (!info.isDirectory()) return;

  let entries;
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- enumerating the granted path
    entries = await readdir(path, { withFileTypes: true });
  } catch (error) {
    throw new ScanError(`could not enumerate input: ${path}: ${error.message}`);
  }
  entries.sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    if (entry.isDirectory() && options.ignoredDirectories.has(entry.name)) continue;
    const child = path === "." ? entry.name : join(path, entry.name);
    await collect(child, files, options);
  }
}

/**
 * Scan one file. Always resolves; per-file scanner errors are returned in the
 * result rather than thrown, so the caller can decide between continuing and
 * failing the run distinctly (exit 2).
 *
 * @returns {Promise<{path, kind: "ok"|"error", findings?, scannedScalars?,
 * bytes?, error?}>}
 */
export async function scanFile(path, { scannerOptions = {}, includeBytes = false } = {}) {
  let bytes;
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- reading an enumerated path
    bytes = await readFile(path);
  } catch (error) {
    return { path, kind: "error", error: `read failed: ${error.message}` };
  }

  if (isContainerPath(path)) {
    try {
      const results = await scanContainers(path, bytes, scannerOptions);
      return {
        path,
        kind: "ok",
        findings: results.findings,
        scannedScalars: results.scannedScalars,
        bytes: includeBytes ? bytes : undefined,
      };
    } catch (error) {
      return { path, kind: "error", error: `container scan failed: ${error.message}` };
    }
  }

  let text;
  try {
    text = UTF8_DECODER.decode(bytes);
  } catch {
    return { path, kind: "error", error: "malformed UTF-8 (scan aborted for file; input preserved untouched)" };
  }

  try {
    const { findings, scannedScalars } = scanText(text, scannerOptions);
    const extras = scannerOptions.hiddenStyles === false ? [] : scanTextExtras(path, text);
    const all = [...findings, ...extras];
    all.sort((a, b) => (a.byte_offset ?? 0) - (b.byte_offset ?? 0));
    return { path, kind: "ok", findings: all, scannedScalars, bytes: includeBytes ? bytes : undefined, text };
  } catch (error) {
    return { path, kind: "error", error: `scan failed: ${error.message}` };
  }
}

/**
 * Apply settings detector toggles to a findings list.
 */
export function applyDetectorToggles(findings, scannerSettings) {
  return findings.filter((finding) => {
    if (scannerSettings.bidi === false && BIDI_NAMES.has(finding.name)) return false;
    if (scannerSettings.tags === false && TAG_NAMES.has(finding.name)) return false;
    if (scannerSettings.variation_selectors === false && /^VS\d+$/u.test(finding.name)) return false;
    return true;
  });
}

const BIDI_NAMES = new Set(["LRE", "RLE", "PDF", "LRO", "RLO", "LRI", "RLI", "FSI", "PDI", "ALM"]);
const TAG_NAMES = new Set(["LANGUAGE TAG", "CANCEL TAG", "TAG CHARACTER"]);
