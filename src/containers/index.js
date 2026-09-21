// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Jonathan D.A. Jewell
//
// containers/index.js — routing for document-container detectors.
//
// Text findings and container findings share one shape, so the CLI report,
// JSON diagnostics, thresholds, and repair planner treat them identically.
// Positions inside containers are attributed to `<file>::<member>` via the
// finding's `member` field.

import { extname } from "node:path";
import { readEntries } from "./ZipReader.bun.js";
import { scanDocx, scanPptx, scanXlsx } from "./Ooxml.bun.js";
import { scanPdf } from "./Pdf.bun.js";
import { scanHiddenStyles } from "./HiddenStyle.bun.js";

const CONTAINERS = new Set([".docx", ".pptx", ".xlsx", ".pdf"]);

export function isContainerPath(path) {
  return CONTAINERS.has(extname(path).toLowerCase());
}

/**
 * Scan a container document.
 * @returns {Promise<{findings: object[], scannedScalars: number}>}
 */
export async function scanContainers(path, bytes, scannerOptions = {}) {
  const ext = extname(path).toLowerCase();
  if (ext === ".pdf") {
    return scanPdf(path, bytes);
  }
  const members = readEntries(bytes); // throws ZipError on junk — caller maps to scanner error
  if (ext === ".docx") return scanDocx(path, members, scannerOptions);
  if (ext === ".pptx") return scanPptx(path, members, scannerOptions);
  if (ext === ".xlsx") return scanXlsx(path, members, scannerOptions);
  return { findings: [], scannedScalars: 0 };
}

/**
 * Extra text-level detectors for markup/style sources (hidden-text idioms).
 */
export function scanTextExtras(path, text) {
  return scanHiddenStyles(text, extname(path).toLowerCase());
}
