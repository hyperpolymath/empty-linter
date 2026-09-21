// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Jonathan D.A. Jewell
//
// empty-lint-ci.js — the STABLE CI entry point.
//
// This is the command the dogfood gate (and downstream repos across the
// estate) invoke. Its interface, output lines, and exit codes are frozen:
//
//   --threshold critical|error|warning|info   --all-files   --help
//   exit 0 scan okay · exit 1 threshold findings · exit 2 scan could not run
//   "empty-linter: scanned N file(s); M finding(s), B blocking at threshold T"
//
// Since issue #74, the scanning underneath is the expanded scalar-accurate
// engine (bidi, tags, variation selectors, fillers, zalgo, containers); the
// legacy AffineScript detector in src/core/ByteDetector.bun.js remains the
// reviewed reference implementation for the minimum catalogue and keeps its
// own test suite. The full product CLI is src/cli/Main.bun.js; this shim is
// its stable, read-only, audit-only front.

import { collectFiles, scanFile, ScanError } from "../src/core/ScannerIO.bun.js";
import { atOrAbove, githubAnnotation } from "../src/core/Report.bun.js";
import { hex } from "../src/core/UnicodeData.bun.js";

const EXIT_FINDINGS = 1;
const EXIT_SCAN_ERROR = 2;

function usage() {
  console.log(`Usage: bun run scripts/empty-lint-ci.js [options] [path ...]

Options:
  --threshold critical|error|warning|info  Lowest severity that fails (default: critical)
  --all-files                             Scan every UTF-8-decodable regular file
  --help                                  Show this help

Exit status:
  0  Scan completed with no findings at or above the threshold
  1  Findings at or above the threshold
  2  The scan could not be completed

The command never modifies input. Findings below the threshold are still reported.
Extended diagnostics (settings, JSON/hex reports, repair plans) live in
src/cli/Main.bun.js; this shim is the stable audit surface for CI.`);
}

const THRESHOLD_NAMES = new Map([["critical", "critical"], ["error", "error"], ["warning", "warning"], ["info", "info"]]);

function parseArguments(args) {
  let threshold = "critical";
  let allFiles = false;
  const paths = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args.at(index);
    if (arg === "--help") {
      usage();
      process.exit(0);
    } else if (arg === "--all-files") {
      allFiles = true;
    } else if (arg === "--threshold") {
      index += 1;
      if (index >= args.length) throw new Error("--threshold requires a value");
      threshold = args.at(index).toLowerCase();
    } else if (arg.startsWith("--threshold=")) {
      threshold = arg.slice("--threshold=".length).toLowerCase();
    } else if (arg.startsWith("-")) {
      throw new Error(`unknown option: ${arg}`);
    } else {
      paths.push(arg);
    }
  }

  if (!THRESHOLD_NAMES.has(threshold)) {
    throw new Error(`invalid threshold: ${threshold}`);
  }

  return {
    allFiles,
    paths: paths.length === 0 ? ["."] : paths,
    threshold,
  };
}

function annotation(path, finding, blocking) {
  const level = blocking ? "error" : "warning";
  const codePoint = finding.code_point === null ? finding.name : `U+${hex(finding.code_point)}`;
  if (process.env.GITHUB_ACTIONS === "true") {
    console.log(githubAnnotation(path, finding, blocking));
  } else {
    const line = finding.line ?? 1;
    const column = finding.column ?? 1;
    console.log(`${path}:${line}:${column}: ${level}: ${finding.name} ${codePoint} (${finding.severity})`);
  }
}

async function main() {
  let options;
  try {
    options = parseArguments(process.argv.slice(2));
  } catch (error) {
    console.error(`empty-linter: ${error.message}`);
    usage();
    process.exit(EXIT_SCAN_ERROR);
  }

  let files;
  try {
    files = await collectFiles(options.paths, { allFiles: options.allFiles });
  } catch (error) {
    if (error instanceof ScanError) {
      console.error(`empty-linter: ${error.message}`);
    } else {
      console.error(`empty-linter: could not enumerate input: ${error.message}`);
    }
    process.exit(EXIT_SCAN_ERROR);
  }

  let findings = 0;
  let blockingFindings = 0;
  const scanErrors = [];

  for (const path of files) {
    const result = await scanFile(path, { scannerOptions: {} });
    if (result.kind === "error") {
      scanErrors.push(`${path}: ${result.error}`);
      continue;
    }
    for (const finding of result.findings) {
      findings += 1;
      const blocking = atOrAbove(finding, options.threshold);
      if (blocking) blockingFindings += 1;
      annotation(path, finding, blocking);
    }
  }

  if (scanErrors.length > 0) {
    for (const error of scanErrors) {
      console.error(`empty-linter: scan failed: ${error}`);
    }
    console.error(`empty-linter: ${scanErrors.length} file(s) could not be scanned (scanner errors fail distinctly from findings)`);
    process.exit(EXIT_SCAN_ERROR);
  }

  console.log(`empty-linter: scanned ${files.length} file(s); ${findings} finding(s), ${blockingFindings} blocking at threshold ${options.threshold}`);
  process.exit(blockingFindings > 0 ? EXIT_FINDINGS : 0);
}

await main();
