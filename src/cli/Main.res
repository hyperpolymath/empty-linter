// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2025 Hyperpolymath
//
// Main CLI entry point for empty-linter
// 🏆 Idris Inside - Powered by proven library

open Deno
open NickelConfig
open Glob
open ByteDetector
open PathHandler
open TextTransform

/** CLI version */
let version = "0.1.0"

/** CLI command */
type command =
  | Audit
  | Fix
  | Transform
  | Check
  | Help
  | Version

/** CLI options */
type cliOptions = {
  command: command,
  paths: array<string>,
  recursive: bool,
  severity: string,
  format: string,
  workspace: option<string>,
  autoFix: bool,
  verbose: bool,
  quiet: bool,
  configPath: option<string>,
}

/** Default CLI options */
let defaultCliOptions: cliOptions = {
  command: Audit,
  paths: ["."],
  recursive: true,
  severity: "warning",
  format: "text",
  workspace: None,
  autoFix: false,
  verbose: false,
  quiet: false,
  configPath: None,
}

/** Print colored output */
let print = (text: string): unit => {
  Console.log(text)
}

/** Print error */
let printError = (text: string): unit => {
  Console.error(Colors.wrap(Colors.red, "Error: " ++ text))
}

/** Print warning */
let printWarning = (text: string): unit => {
  Console.warn(Colors.wrap(Colors.yellow, "Warning: " ++ text))
}

/** Print success */
let printSuccess = (text: string): unit => {
  Console.log(Colors.wrap(Colors.green, text))
}

/** Print help message */
let printHelp = (): unit => {
  print(`
${Colors.wrap(Colors.bold ++ Colors.magenta, "empty-linter")} v${version}
${Colors.wrap(Colors.dim, "Negative-Space Diagnostics - See what is not there")}
${Colors.wrap(Colors.cyan, "Idris Inside")} - Powered by proven library

${Colors.wrap(Colors.bold, "USAGE:")}
  empty-linter [COMMAND] [OPTIONS] [PATHS...]

${Colors.wrap(Colors.bold, "COMMANDS:")}
  audit      Scan files for invisible artifacts (default)
  fix        Automatically fix detected artifacts
  transform  Apply text transformations
  check      Check files against workspace constraints
  help       Show this help message
  version    Show version information

${Colors.wrap(Colors.bold, "OPTIONS:")}
  -r, --recursive     Scan directories recursively (default: true)
  -s, --severity      Minimum severity level: critical|error|warning|info
  -f, --format        Output format: text|json|hex
  -w, --workspace     Apply workspace preset: twitter|linkedin|github|jira
  --fix               Auto-fix detected artifacts
  -v, --verbose       Verbose output
  -q, --quiet         Suppress non-error output
  -c, --config        Path to config.ncl

${Colors.wrap(Colors.bold, "EXAMPLES:")}
  empty-linter                    # Audit current directory
  empty-linter audit src/         # Audit src/ directory
  empty-linter fix --recursive    # Fix all files recursively
  empty-linter check -w twitter   # Check against Twitter constraints
  empty-linter transform file.txt # Transform a file

${Colors.wrap(Colors.bold, "SEVERITY LEVELS:")}
  ${Colors.wrap(Colors.brightRed, "critical")}  Must be fixed (null bytes)
  ${Colors.wrap(Colors.red, "error")}     Should be fixed (NBSP, ZWSP)
  ${Colors.wrap(Colors.yellow, "warning")}   May need attention (BOM)
  ${Colors.wrap(Colors.cyan, "info")}      Informational only

${Colors.wrap(Colors.dim, "Documentation: https://github.com/hyperpolymath/empty-linter")}
`)
}

/** Print version */
let printVersion = (): unit => {
  print(`empty-linter v${version}`)
  print(Colors.wrap(Colors.dim, "Idris Inside - Powered by proven library"))
}

/** Parse command from string */
let parseCommand = (s: string): command => {
  switch Js.String2.toLowerCase(s) {
  | "audit" | "scan" | "lint" => Audit
  | "fix" | "clean" | "repair" => Fix
  | "transform" | "normalize" => Transform
  | "check" | "validate" => Check
  | "help" | "-h" | "--help" => Help
  | "version" | "-v" | "--version" => Version
  | _ => Audit
  }
}

/** Parse CLI arguments */
let parseArgs = (args: array<string>): cliOptions => {
  let options = ref(defaultCliOptions)
  let paths = ref([])
  let i = ref(0)

  while i.contents < Belt.Array.length(args) {
    let arg = Belt.Array.getUnsafe(args, i.contents)

    switch arg {
    | "-r" | "--recursive" =>
      options := { ...options.contents, recursive: true }

    | "--no-recursive" =>
      options := { ...options.contents, recursive: false }

    | "-s" | "--severity" =>
      i := i.contents + 1
      if i.contents < Belt.Array.length(args) {
        let val = Belt.Array.getUnsafe(args, i.contents)
        options := { ...options.contents, severity: val }
      }

    | "-f" | "--format" =>
      i := i.contents + 1
      if i.contents < Belt.Array.length(args) {
        let val = Belt.Array.getUnsafe(args, i.contents)
        options := { ...options.contents, format: val }
      }

    | "-w" | "--workspace" =>
      i := i.contents + 1
      if i.contents < Belt.Array.length(args) {
        let val = Belt.Array.getUnsafe(args, i.contents)
        options := { ...options.contents, workspace: Some(val) }
      }

    | "--fix" =>
      options := { ...options.contents, autoFix: true }

    | "-v" | "--verbose" =>
      options := { ...options.contents, verbose: true }

    | "-q" | "--quiet" =>
      options := { ...options.contents, quiet: true }

    | "-c" | "--config" =>
      i := i.contents + 1
      if i.contents < Belt.Array.length(args) {
        let val = Belt.Array.getUnsafe(args, i.contents)
        options := { ...options.contents, configPath: Some(val) }
      }

    | "-h" | "--help" =>
      options := { ...options.contents, command: Help }

    | "--version" =>
      options := { ...options.contents, command: Version }

    | s if !Js.String2.startsWith(s, "-") =>
      // Check if it's a command or a path
      if i.contents == 0 {
        options := { ...options.contents, command: parseCommand(s) }
      } else {
        paths := Belt.Array.concat(paths.contents, [s])
      }

    | _ => ()
    }

    i := i.contents + 1
  }

  // Use paths if provided, otherwise default
  if Belt.Array.length(paths.contents) > 0 {
    { ...options.contents, paths: paths.contents }
  } else {
    options.contents
  }
}

/** Format artifact for display */
let formatArtifact = (a: artifact, format: string): string => {
  switch format {
  | "json" =>
    `{"line":${Belt.Int.toString(a.line)},"column":${Belt.Int.toString(a.column)},"name":"${a.name}","hex":"${a.hexValue}"}`

  | "hex" =>
    `0x${Js.String2.toUpperCase(a.hexValue)} [${a.name}] L:${Belt.Int.toString(a.line)} C:${Belt.Int.toString(a.column)}`

  | _ =>
    let severityStr = switch a.severity {
    | Critical => Colors.wrap(Colors.brightRed ++ Colors.bold, "CRIT")
    | Error => Colors.wrap(Colors.red, "ERR ")
    | Warning => Colors.wrap(Colors.yellow, "WARN")
    | Info => Colors.wrap(Colors.cyan, "INFO")
    }
    `  ${severityStr} ${Colors.wrap(Colors.magenta, a.name)} (0x${Js.String2.toUpperCase(a.hexValue)}) at L:${Belt.Int.toString(a.line)} C:${Belt.Int.toString(a.column)}`
  }
}

/** Run audit command */
let runAudit = async (options: cliOptions, config: config): int => {
  let totalArtifacts = ref(0)
  let totalFiles = ref(0)
  let minSeverity = parseSeverity(options.severity)

  if !options.quiet {
    print(Colors.wrap(Colors.bold, "Scanning for invisible artifacts..."))
    print("")
  }

  for i in 0 to Belt.Array.length(options.paths) - 1 {
    let targetPath = Belt.Array.getUnsafe(options.paths, i)

    // Get files to scan
    let files = if options.recursive {
      await glob(Patterns.allFiles, { ...defaultOptions, root: targetPath, exclude: config.linter.excludePaths })
    } else {
      [targetPath]
    }

    for j in 0 to Belt.Array.length(files) - 1 {
      let filePath = Belt.Array.getUnsafe(files, j)

      // Skip if excluded
      if !isExcluded(config, filePath) {
        switch validate(filePath) {
        | Some(validPath) =>
          let pathStr = unwrap(validPath)

          try {
            let content = await Deno.readTextFile(pathStr)
            let artifacts = scan(content)
            let filtered = filterBySeverity(artifacts, minSeverity)

            totalFiles := totalFiles.contents + 1

            if Belt.Array.length(filtered) > 0 {
              totalArtifacts := totalArtifacts.contents + Belt.Array.length(filtered)

              if !options.quiet {
                print(Colors.wrap(Colors.bold, pathStr))
                filtered->Belt.Array.forEach(a => {
                  print(formatArtifact(a, options.format))
                })
                print("")
              }
            } else if options.verbose {
              print(Colors.wrap(Colors.green, "✓ ") ++ pathStr)
            }
          } catch {
          | _ =>
            if options.verbose {
              printWarning(`Could not read: ${pathStr}`)
            }
          }
        | None => ()
        }
      }
    }
  }

  // Summary
  if !options.quiet {
    print(Colors.wrap(Colors.bold, "═══════════════════════════════════════"))
    print(`Files scanned: ${Belt.Int.toString(totalFiles.contents)}`)
    if totalArtifacts.contents > 0 {
      print(Colors.wrap(Colors.red, `Artifacts found: ${Belt.Int.toString(totalArtifacts.contents)}`))
    } else {
      printSuccess("No artifacts found!")
    }
  }

  if totalArtifacts.contents > 0 { 1 } else { 0 }
}

/** Run fix command */
let runFix = async (options: cliOptions, config: config): int => {
  let totalFixed = ref(0)
  let totalFiles = ref(0)

  if !options.quiet {
    print(Colors.wrap(Colors.bold, "Fixing invisible artifacts..."))
    print("")
  }

  for i in 0 to Belt.Array.length(options.paths) - 1 {
    let targetPath = Belt.Array.getUnsafe(options.paths, i)

    let files = if options.recursive {
      await glob(Patterns.allFiles, { ...defaultOptions, root: targetPath, exclude: config.linter.excludePaths })
    } else {
      [targetPath]
    }

    for j in 0 to Belt.Array.length(files) - 1 {
      let filePath = Belt.Array.getUnsafe(files, j)

      if !isExcluded(config, filePath) {
        switch validate(filePath) {
        | Some(validPath) =>
          let pathStr = unwrap(validPath)

          try {
            let content = await Deno.readTextFile(pathStr)
            let (fixed, count) = applyFixes(content)

            if count > 0 {
              await Deno.writeTextFile(pathStr, fixed)
              totalFixed := totalFixed.contents + count
              totalFiles := totalFiles.contents + 1

              if !options.quiet {
                print(Colors.wrap(Colors.green, "✓ ") ++ `${pathStr} (${Belt.Int.toString(count)} fixes)`)
              }
            } else if options.verbose {
              print(Colors.wrap(Colors.dim, "  " ++ pathStr ++ " (no changes)"))
            }
          } catch {
          | _ =>
            if options.verbose {
              printWarning(`Could not process: ${pathStr}`)
            }
          }
        | None => ()
        }
      }
    }
  }

  if !options.quiet {
    print("")
    print(Colors.wrap(Colors.bold, "═══════════════════════════════════════"))
    print(`Files modified: ${Belt.Int.toString(totalFiles.contents)}`)
    print(`Total fixes: ${Belt.Int.toString(totalFixed.contents)}`)
  }

  0
}

/** Run transform command */
let runTransform = async (options: cliOptions, _config: config): int => {
  if !options.quiet {
    print(Colors.wrap(Colors.bold, "Transforming files..."))
    print("")
  }

  for i in 0 to Belt.Array.length(options.paths) - 1 {
    let filePath = Belt.Array.getUnsafe(options.paths, i)

    switch validate(filePath) {
    | Some(validPath) =>
      let pathStr = unwrap(validPath)

      try {
        let content = await Deno.readTextFile(pathStr)
        let transformed = transformDefault(content)

        if content != transformed {
          await Deno.writeTextFile(pathStr, transformed)
          if !options.quiet {
            printSuccess(`✓ ${pathStr}`)
          }
        } else if options.verbose {
          print(Colors.wrap(Colors.dim, "  " ++ pathStr ++ " (no changes)"))
        }
      } catch {
      | _ => printError(`Could not process: ${pathStr}`)
      }
    | None =>
      printError(`Invalid path: ${filePath}`)
    }
  }

  0
}

/** Run check command (workspace constraints) */
let runCheck = async (options: cliOptions, _config: config): int => {
  let hasViolations = ref(false)

  let workspaceName = switch options.workspace {
  | Some(w) => w
  | None => "default"
  }

  if !options.quiet {
    print(Colors.wrap(Colors.bold, `Checking against workspace: ${workspaceName}`))
    print("")
  }

  for i in 0 to Belt.Array.length(options.paths) - 1 {
    let filePath = Belt.Array.getUnsafe(options.paths, i)

    switch validate(filePath) {
    | Some(validPath) =>
      let pathStr = unwrap(validPath)

      try {
        let content = await Deno.readTextFile(pathStr)

        switch applyWorkspace(content, workspaceName) {
        | Ok((_, violations)) =>
          if Belt.Array.length(violations) > 0 {
            hasViolations := true
            print(Colors.wrap(Colors.red, `✗ ${pathStr}`))
            violations->Belt.Array.forEach(v => {
              print(Colors.wrap(Colors.yellow, `    ${v}`))
            })
          } else {
            printSuccess(`✓ ${pathStr}`)
          }
        | Error(e) =>
          printError(e)
        }

        // Show metrics
        if options.verbose {
          let m = getMetrics(content)
          print(Colors.wrap(Colors.dim, `    ${metricsToString(m)}`))
        }
      } catch {
      | _ => printError(`Could not read: ${pathStr}`)
      }
    | None =>
      printError(`Invalid path: ${filePath}`)
    }
  }

  if hasViolations.contents { 1 } else { 0 }
}

/** Main entry point */
let main = async (): unit => {
  let args = Deno.args
  let options = parseArgs(args)

  // Handle help and version first
  switch options.command {
  | Help =>
    printHelp()
    Deno.exit(0)
  | Version =>
    printVersion()
    Deno.exit(0)
  | _ => ()
  }

  // Load configuration
  let configPath = switch options.configPath {
  | Some(p) => p
  | None => Path.join([Deno.cwd(), "config.ncl"])
  }
  let config = await loadConfig(configPath)

  // Run command
  let exitCode = switch options.command {
  | Audit => await runAudit(options, config)
  | Fix => await runFix(options, config)
  | Transform => await runTransform(options, config)
  | Check => await runCheck(options, config)
  | Help | Version => 0
  }

  Deno.exit(exitCode)
}

// Run main
let _ = main()
