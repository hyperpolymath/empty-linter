// SPDX-License-Identifier: PMPL-1.0-or-later
// SPDX-FileCopyrightText: 2025 Hyperpolymath
//
// Nickel configuration bindings for empty-linter
// Parses config.ncl and provides typed access to configuration

open Deno

/** Severity level from config */
type configSeverity =
  | Critical
  | Error
  | Warning
  | Info

/** Line ending from config */
type configLineEnding =
  | LF
  | CRLF
  | CR

/** Output format from config */
type configOutputFormat =
  | Text
  | Json
  | Hex

/** Artifact definition from config */
type configArtifact = {
  name: string,
  hex: string,
  severity: configSeverity,
  fixAction: string,
}

/** Transform options from config */
type configTransform = {
  trimLines: bool,
  trimDocument: bool,
  collapseSpaces: bool,
  normalizeLineEndings: bool,
  targetLineEnding: configLineEnding,
  maxBlankLines: int,
  removeInvisibles: bool,
  ensureFinalNewline: bool,
}

/** Workspace constraints from config */
type configConstraints = {
  maxChars: option<int>,
  maxWords: option<int>,
  maxLines: option<int>,
  maxBytes: option<int>,
}

/** Workspace definition from config */
type configWorkspace = {
  name: string,
  constraints: configConstraints,
  transform: string,
}

/** Proven modules configuration */
type configProven = {
  enabled: bool,
  safeHex: bool,
  safePath: bool,
  safeString: bool,
  safeWhitespace: bool,
}

/** Dotmatrix integration configuration */
type configDotmatrix = {
  enabled: bool,
  ipcMode: string,
  socketPath: string,
  hexDumpFormat: string,
}

/** Linter configuration */
type configLinter = {
  targetDir: string,
  overlayColor: string,
  autoFix: bool,
  minSeverity: configSeverity,
  outputFormat: configOutputFormat,
  excludePaths: array<string>,
  artifacts: array<configArtifact>,
}

/** Full configuration structure */
type config = {
  proven: configProven,
  linter: configLinter,
  transform: Js.Dict.t<configTransform>,
  workspaces: Js.Dict.t<configWorkspace>,
  dotmatrix: configDotmatrix,
}

/** Default configuration values */
let defaultConfig: config = {
  proven: {
    enabled: true,
    safeHex: true,
    safePath: true,
    safeString: true,
    safeWhitespace: true,
  },
  linter: {
    targetDir: ".",
    overlayColor: "magenta",
    autoFix: false,
    minSeverity: Warning,
    outputFormat: Text,
    excludePaths: ["node_modules", ".git", "lib", "dist", "build", ".cache"],
    artifacts: [
      { name: "NULL", hex: "0x00", severity: Critical, fixAction: "remove" },
      { name: "NBSP", hex: "0xA0", severity: Error, fixAction: "replace:20" },
      { name: "ZWSP", hex: "0x200B", severity: Error, fixAction: "remove" },
      { name: "BOM", hex: "0xFEFF", severity: Warning, fixAction: "remove" },
    ],
  },
  transform: Js.Dict.empty(),
  workspaces: Js.Dict.empty(),
  dotmatrix: {
    enabled: false,
    ipcMode: "stdio",
    socketPath: "/tmp/dotmatrix.sock",
    hexDumpFormat: "dotmatrix",
  },
}

/** Parse severity string */
let parseSeverity = (s: string): configSeverity => {
  switch Js.String2.toLowerCase(s) {
  | "critical" => Critical
  | "error" => Error
  | "warning" => Warning
  | "info" => Info
  | _ => Warning
  }
}

/** Parse line ending string */
let parseLineEnding = (s: string): configLineEnding => {
  switch Js.String2.toUpperCase(s) {
  | "LF" => LF
  | "CRLF" => CRLF
  | "CR" => CR
  | _ => LF
  }
}

/** Parse output format string */
let parseOutputFormat = (s: string): configOutputFormat => {
  switch Js.String2.toLowerCase(s) {
  | "json" => Json
  | "hex" => Hex
  | "text" | _ => Text
  }
}

/** Severity to string */
let severityToString = (s: configSeverity): string => {
  switch s {
  | Critical => "critical"
  | Error => "error"
  | Warning => "warning"
  | Info => "info"
  }
}

/** Output format to string */
let outputFormatToString = (f: configOutputFormat): string => {
  switch f {
  | Text => "text"
  | Json => "json"
  | Hex => "hex"
  }
}

/** Parse JSON config (simplified - real impl would use Nickel CLI) */
let parseJsonConfig = (json: Js.Json.t): result<config, string> => {
  try {
    // For now, return default config
    // Real implementation would parse the JSON structure
    Ok(defaultConfig)
  } catch {
  | _ => Error("Failed to parse configuration")
  }
}

/** Load configuration from file
 *
 * Attempts to load config.ncl, falling back to defaults if not found.
 * In production, this would shell out to `nickel export` for NCL parsing.
 */
let loadConfig = async (configPath: string): config => {
  let exists = await Deno.exists(configPath)
  if exists {
    // For NCL files, we'd need to run: nickel export --format json config.ncl
    // For now, return defaults
    defaultConfig
  } else {
    defaultConfig
  }
}

/** Load configuration from default location */
let loadDefaultConfig = async (): config => {
  let cwd = Deno.cwd()
  await loadConfig(Path.join([cwd, "config.ncl"]))
}

/** Get transform options by name */
let getTransform = (config: config, name: string): option<configTransform> => {
  Js.Dict.get(config.transform, name)
}

/** Get workspace by name */
let getWorkspace = (config: config, name: string): option<configWorkspace> => {
  Js.Dict.get(config.workspaces, name)
}

/** Check if path should be excluded */
let isExcluded = (config: config, path: string): bool => {
  config.linter.excludePaths->Belt.Array.some(exc => {
    Js.String2.includes(path, "/" ++ exc ++ "/") ||
    Js.String2.endsWith(path, "/" ++ exc) ||
    path == exc
  })
}
