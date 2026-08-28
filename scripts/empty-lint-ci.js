// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Jonathan D.A. Jewell

import {
  Critical,
  Info,
  SevError,
  Warning,
  scan,
} from "../src/core/ByteDetector.bun.js";
import { lstat, readFile, readdir } from "node:fs/promises";
import { extname, join } from "node:path";

const EXIT_FINDINGS = 1;
const EXIT_SCAN_ERROR = 2;

const DEFAULT_EXTENSIONS = new Set([
  ".a2ml", ".adoc", ".affine", ".c", ".cc", ".cpp", ".css", ".csv",
  ".ex", ".exs", ".gleam", ".h", ".hpp", ".hs", ".html", ".idr",
  ".java", ".jl", ".js", ".json", ".jsx", ".k9", ".md", ".ml",
  ".ncl", ".res", ".rs", ".sh", ".svg", ".tex", ".toml", ".ts",
  ".tsx", ".txt", ".v", ".xml", ".yaml", ".yml", ".zig",
]);

const DEFAULT_IGNORED_DIRECTORIES = new Set([
  ".git", ".lake", "_build", "deps", "external_corpora",
  "node_modules", "target",
]);

const SEVERITY_RANK = new Map([
  [Info, 1],
  [Warning, 2],
  [SevError, 3],
  [Critical, 4],
]);

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

The command never modifies input. Findings below the threshold are still reported.`);
}

function parseArguments(args) {
  let threshold = "critical";
  let allFiles = false;
  const paths = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help") {
      usage();
      process.exit(0);
    } else if (arg === "--all-files") {
      allFiles = true;
    } else if (arg === "--threshold") {
      index += 1;
      if (index >= args.length) throw new Error("--threshold requires a value");
      threshold = args[index].toLowerCase();
    } else if (arg.startsWith("--threshold=")) {
      threshold = arg.slice("--threshold=".length).toLowerCase();
    } else if (arg.startsWith("-")) {
      throw new Error(`unknown option: ${arg}`);
    } else {
      paths.push(arg);
    }
  }

  const thresholds = {
    critical: Critical,
    error: SevError,
    warning: Warning,
    info: Info,
  };
  if (!(threshold in thresholds)) {
    throw new Error(`invalid threshold: ${threshold}`);
  }

  return {
    allFiles,
    paths: paths.length === 0 ? ["."] : paths,
    threshold: thresholds[threshold],
    thresholdName: threshold,
  };
}

function extension(path) {
  return extname(path).toLowerCase();
}

function shouldScan(path, allFiles) {
  return allFiles || DEFAULT_EXTENSIONS.has(extension(path));
}

async function collectFiles(path, allFiles, files) {
  const info = await lstat(path);
  if (info.isSymbolicLink()) return;
  if (info.isFile()) {
    if (shouldScan(path, allFiles)) files.push(path);
    return;
  }
  if (!info.isDirectory()) return;

  const entries = await readdir(path, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    if (entry.isDirectory() && DEFAULT_IGNORED_DIRECTORIES.has(entry.name)) continue;
    const child = path === "." ? entry.name : join(path, entry.name);
    await collectFiles(child, allFiles, files);
  }
}

function severityName(severity) {
  if (severity === Critical) return "critical";
  if (severity === SevError) return "error";
  if (severity === Warning) return "warning";
  return "info";
}

function annotation(path, artifact, blocking) {
  const level = blocking ? "error" : "warning";
  const message = `${artifact.name} U+${artifact.byte_value.toString(16).toUpperCase().padStart(4, "0")} (${severityName(artifact.severity)})`;
  if (process.env.GITHUB_ACTIONS === "true") {
    console.log(`::${level} file=${path},line=${artifact.line},col=${artifact.column}::${message}`);
  } else {
    console.log(`${path}:${artifact.line}:${artifact.column}: ${level}: ${message}`);
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

  const files = [];
  try {
    for (const path of options.paths) await collectFiles(path, options.allFiles, files);
  } catch (error) {
    console.error(`empty-linter: could not enumerate input: ${error.message}`);
    process.exit(EXIT_SCAN_ERROR);
  }

  let findings = 0;
  let blockingFindings = 0;
  try {
    for (const path of files) {
      const content = await readFile(path, "utf8");
      for (const artifact of scan(content)) {
        findings += 1;
        const blocking = SEVERITY_RANK.get(artifact.severity) >= SEVERITY_RANK.get(options.threshold);
        if (blocking) blockingFindings += 1;
        annotation(path, artifact, blocking);
      }
    }
  } catch (error) {
    console.error(`empty-linter: scan failed: ${error.message}`);
    process.exit(EXIT_SCAN_ERROR);
  }

  console.log(`empty-linter: scanned ${files.length} file(s); ${findings} finding(s), ${blockingFindings} blocking at threshold ${options.thresholdName}`);
  process.exit(blockingFindings > 0 ? EXIT_FINDINGS : 0);
}

await main();
