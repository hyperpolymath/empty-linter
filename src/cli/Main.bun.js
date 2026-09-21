// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Jonathan D.A. Jewell
//
// Main.bun.js — the Empty-linter CLI.
//
//   empty-linter audit [path …]   read-only scan (default; exit 0/1/2)
//   empty-linter show <file>      visible-character rendering ("formatting marks")
//   empty-linter plan <file>      propose a repair plan (JSON, no mutation)
//   empty-linter approve <plan>   record a grant (mechanical / named ambiguous)
//   empty-linter refuse <plan>    record an explicit refusal
//   empty-linter apply <plan>     apply approved plan TO COPIES (in-place refused)
//   empty-linter verify <prov>    independently rescan outputs (+ rescan records)
//
// Exit status (every command): 0 success / no blocking findings,
// 1 findings/policy, 2 the operation could not complete. Scanner errors fail
// distinctly from findings. Audit never mutates input; apply never writes
// over input (in-place application is refused by construction).

import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
import { collectFiles, scanFile, applyDetectorToggles, DEFAULT_IGNORED_DIRECTORIES, ScanError } from "../core/ScannerIO.bun.js";
import { defaultSettings, loadSettingsFile, SettingsError } from "../core/Settings.bun.js";
import { CATALOGUE_VERSION, forCodePoint, hex } from "../core/UnicodeData.bun.js";
import { renderVisible } from "../core/Render.bun.js";
import {
  atOrAbove, diagnosticRecord, formatHexReport, formatTextReport,
  githubAnnotation, THRESHOLDS,
} from "../core/Report.bun.js";
import {
  approvePlan, applyPlanToCopy, proposePlan, provenanceRecord, refusePlan,
  RepairError, sha256Hex, unifiedDiff, verifyCopy,
} from "../core/Repair.bun.js";
import { scanText } from "../core/ScalarScanner.bun.js";
import { checkConstraints } from "../core/TextTransform.bun.js";
import { TOOL_VERSION } from "../core/Version.bun.js";
// applyPlanToCopy applies transform profiles internally; Main never mutates text itself.

const EXIT_FINDINGS = 1;
const EXIT_ERROR = 2;

const UTF8_DECODER = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

// ── Entry ─────────────────────────────────────────────────────────────────────

export async function main(argv, io = defaultIo()) {
  const { command, args, flags } = splitCommand(argv);
  try {
    switch (command) {
      case "help": case "--help": case "-h": usage(io); return io.exit(0);
      case "audit": return await cmdAudit(args, flags, io);
      case "show": return await cmdShow(args, flags, io);
      case "plan": return await cmdPlan(args, flags, io);
      case "approve": return await cmdApprove(args, flags, io);
      case "refuse": return await cmdRefuse(args, flags, io);
      case "apply": return await cmdApply(args, flags, io);
      case "verify": return await cmdVerify(args, flags, io);
      case "tui": {
        const { runTui } = await import("../tui/entry.bun.js");
        return await runTui(args, flags, io);
      }
      default:
        io.error(`empty-linter: unknown command "${command}"`);
        usage(io);
        return io.exit(EXIT_ERROR);
    }
  } catch (error) {
    if (error instanceof SettingsError || error instanceof RepairError || error instanceof ScanError) {
      io.error(`empty-linter: ${error.message}`);
      return io.exit(EXIT_ERROR);
    }
    throw error;
  }
}

function defaultIo() {
  return {
    out: (line) => console.log(line),
    error: (line) => console.error(line),
    exit: (code) => { process.exitCode = code; return code; },
    env: process.env,
  };
}

/**
 * Single-pass argv parse: command, positionals, and flags are separated
 * correctly — values of VALUE_FLAGS are consumed with their flag and never
 * mistaken for positionals.
 */
function splitCommand(argv) {
  const commands = new Set(["audit", "show", "plan", "approve", "refuse", "apply", "verify", "tui", "help", "--help", "-h"]);
  let command = "audit";
  let rest = argv;
  if (argv.length > 0 && commands.has(argv[0])) {
    command = argv[0];
    rest = argv.slice(1);
  }

  const flags = { list: new Map(), bool: new Set() };
  const positionals = [];
  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i];
    if (!arg.startsWith("-")) {
      positionals.push(arg);
      continue;
    }
    const eq = arg.indexOf("=");
    if (eq !== -1) {
      flags.list.set(arg.slice(0, eq), arg.slice(eq + 1));
    } else if (VALUE_FLAGS.has(arg)) {
      if (i + 1 >= rest.length) {
        flags.list.set(arg, "");
      } else {
        flags.list.set(arg, rest[i + 1]);
        i += 1;
      }
    } else {
      flags.bool.add(arg);
    }
  }
  return { command, args: positionals, flags };
}

const VALUE_FLAGS = new Set([
  "--threshold", "--format", "--config", "--extensions", "--workspace",
  "--context", "--zalgo-max", "--out", "--profile", "--rationale", "--by",
  "--allow", "--reason", "--report-dir",
]);

const flagValue = (flags, name) => flags.list.get(name);
const flagBool = (flags, name) => flags.bool.has(name);

// ── Settings resolution ───────────────────────────────────────────────────────

export function resolveSettings(flags, io) {
  if (flagBool(flags, "--no-config")) {
    return { settings: defaultSettings(), source: "defaults (--no-config)", warnings: [] };
  }
  const explicit = flagValue(flags, "--config");
  const candidate = explicit ?? (existsSync("config.ncl") ? "config.ncl" : null);
  if (candidate === null) {
    return { settings: defaultSettings(), source: "defaults", warnings: [] };
  }
  if (!existsSync(candidate)) {
    throw new SettingsError(`--config ${candidate}: no such file`);
  }
  const { settings, source, warnings } = loadSettingsFile(candidate, (p) => readFileSync(p, "utf-8"));
  for (const warning of warnings) io.error(`empty-linter: settings warning: ${warning}`);
  return { settings, source: explicit ? `--config ${source}` : source, warnings };
}

function scannerOptionsFrom(settings, flags) {
  return {
    catalogue: settings.scanner.catalogue !== false,
    zalgo: flagBool(flags, "--no-zalgo") ? false : settings.scanner.zalgo.enabled,
    zalgoMaxCombining: intFlag(flags, "--zalgo-max") ?? settings.scanner.zalgo.max_combining,
    contextRadius: intFlag(flags, "--context") ?? settings.scanner.context_radius,
  };
}

function intFlag(flags, name) {
  const raw = flagValue(flags, name);
  if (raw === undefined) return undefined;
  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value)) throw new SettingsError(`${name}: expected an integer, got "${raw}"`);
  return value;
}

function thresholdFrom(settings, flags) {
  const raw = flagValue(flags, "--threshold")?.toLowerCase() ?? settings.linter.min_severity ?? "critical";
  if (!THRESHOLDS.has(raw)) throw new SettingsError(`invalid threshold: ${raw}`);
  return raw;
}

function formatFrom(settings, flags) {
  const raw = flagValue(flags, "--format")?.toLowerCase() ?? settings.linter.output_format ?? "text";
  if (!new Set(["text", "json", "hex"]).has(raw)) throw new SettingsError(`invalid format: ${raw}`);
  return raw;
}

/** Settings-driven artefact table overrides, post-scan. */
export function applyArtifactOverrides(findings, overrides) {
  if (!overrides || overrides.length === 0) return findings;
  const byCp = new Map(overrides.map((o) => [o.code_point, o]));
  return findings.map((finding) => {
    const override = byCp.get(finding.code_point);
    if (!override || finding.code_point === null) return finding;
    const def = forCodePoint(finding.code_point);
    const fix = override.fix_action === "remove" ? { kind: "remove" }
      : override.fix_action === "keep" ? { kind: "keep" }
      : override.fix_action.startsWith("replace:") ? { kind: "replace", with: String.fromCodePoint(Number.parseInt(override.fix_action.slice(8), 16)) }
      : { kind: "review" };
    return {
      ...finding,
      name: override.name,
      severity: override.severity,
      safety: fix.kind === "keep" ? "semantic" : (def?.safety ?? "ambiguous"),
      fix,
      description: `${finding.description} (settings override: severity ${override.severity}, action ${override.fix_action})`,
    };
  });
}

// ── audit ─────────────────────────────────────────────────────────────────────

async function cmdAudit(paths, flags, io) {
  const { settings } = resolveSettings(flags, io);
  const threshold = thresholdFrom(settings, flags);
  const format = formatFrom(settings, flags);
  const scannerOptions = scannerOptionsFrom(settings, flags);
  const extensions = flagValue(flags, "--extensions")
    ? flagValue(flags, "--extensions").split(",").map((e) => e.trim().toLowerCase()).map((e) => (e.startsWith(".") ? e : `.${e}`))
    : settings.scanner.extensions;
  const ignored = new Set([...DEFAULT_IGNORED_DIRECTORIES, ...settings.linter.exclude_paths]);
  const roots = paths.length > 0 ? paths : [settings.linter.target_dir ?? "."];
  const allFiles = flagBool(flags, "--all-files");

  const files = await collectFiles(roots, { extensions, allFiles, ignoredDirectories: ignored });

  const results = [];
  const errors = [];
  let totalFindings = 0;
  let blocking = 0;

  for (const path of files) {
    const result = await scanFile(path, { scannerOptions });
    if (result.kind === "error") {
      errors.push(`${path}: ${result.error}`);
      continue;
    }
    let findings = applyDetectorToggles(result.findings, settings.scanner);
    findings = applyArtifactOverrides(findings, settings.linter.artifacts);

    const workspaceName = flagValue(flags, "--workspace");
    if (workspaceName !== undefined) {
      const workspace = settings.workspaces[workspaceName];
      if (!workspace) throw new SettingsError(`--workspace ${workspaceName}: not defined in settings`);
      findings = [...findings, ...checkConstraints(result.text ?? "", workspace.constraints, workspaceName)];
    }

    totalFindings += findings.length;
    const fileBlocking = findings.filter((f) => atOrAbove(f, threshold)).length;
    blocking += fileBlocking;
    results.push({ path, findings, scannedScalars: result.scannedScalars, blocking: fileBlocking });
  }

  if (errors.length > 0) {
    for (const error of errors) io.error(`empty-linter: scan failed: ${error}`);
    io.error(`empty-linter: ${errors.length} file(s) could not be scanned; scanner errors fail distinctly from findings`);
    return io.exit(EXIT_ERROR);
  }

  emitReport(results, { format, threshold, io, filesScanned: files.length });

  return io.exit(blocking > 0 ? EXIT_FINDINGS : 0);
}

function emitReport(results, { format, threshold, io, filesScanned }) {
  const ci = process.env.GITHUB_ACTIONS === "true";
  if (format === "json") {
    const records = results.map((r) => diagnosticRecord(r));
    io.out(JSON.stringify(records, null, 2));
  } else if (format === "hex") {
    const body = formatHexReport(results);
    if (body.length > 0) io.out(body);
  } else {
    const body = formatTextReport(results);
    if (body.length > 0) io.out(body);
  }
  if (ci) {
    for (const r of results) {
      for (const f of r.findings) io.out(githubAnnotation(r.path, f, atOrAbove(f, threshold)));
    }
  }
  const total = results.reduce((n, r) => n + r.findings.length, 0);
  const blocking = results.reduce((n, r) => n + r.blocking, 0);
  const summary = `empty-linter: scanned ${filesScanned} file(s); ${total} finding(s), ${blocking} blocking at threshold ${threshold}`;
  // Machine formats keep stdout clean for pipes; prose stays on stderr.
  if (format === "json") io.error(summary);
  else io.out(summary);
}

// ── show ──────────────────────────────────────────────────────────────────────

async function cmdShow(paths, flags, io) {
  if (paths.length !== 1) throw new SettingsError("show: exactly one file");
  const bytes = await readFile(paths[0]);
  let text;
  try {
    text = UTF8_DECODER.decode(bytes);
  } catch {
    io.error(`empty-linter: ${paths[0]}: malformed UTF-8; nothing rendered, input untouched`);
    return io.exit(EXIT_ERROR);
  }
  io.out(renderVisible(text));
  return io.exit(0);
}

// ── plan / approve / refuse / apply / verify ──────────────────────────────────

function profileSelection(settings, flags) {
  const name = flagValue(flags, "--profile");
  if (name === undefined) return null;
  const definition = settings.transform[name];
  if (!definition) throw new SettingsError(`--profile ${name}: unknown transform profile in settings`);
  return { name, definition };
}

async function cmdPlan(paths, flags, io) {
  if (paths.length !== 1) throw new SettingsError("plan: exactly one file (repair plans are per-file, inspectable artefacts)");
  const { settings } = resolveSettings(flags, io);
  const scannerOptions = scannerOptionsFrom(settings, flags);
  const result = await scanFile(paths[0], { scannerOptions, includeBytes: true });
  if (result.kind === "error") throw new ScanError(`${paths[0]}: ${result.error}`);
  const findings = applyArtifactOverrides(applyDetectorToggles(result.findings, settings.scanner), settings.linter.artifacts);

  const plan = proposePlan({
    path: paths[0],
    inputBytes: result.bytes,
    inputText: result.text,
    findings,
    settings,
    toolVersion: TOOL_VERSION,
    catalogueVersion: CATALOGUE_VERSION,
    profile: profileSelection(settings, flags),
  });

  const json = JSON.stringify(plan, null, 2);
  const out = flagValue(flags, "--out");
  if (out) {
    await writeFile(out, `${json}\n`);
    io.out(`empty-linter: plan written to ${out} (state: proposed, ${plan.items.length} item(s))`);
  } else {
    io.out(json);
  }
  return io.exit(0);
}

async function loadPlan(planPath) {
  let raw;
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- CLI-given plan path
    raw = await readFile(planPath, "utf-8");
  } catch (error) {
    throw new RepairError(`cannot read plan ${planPath}: ${error.message}`);
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new RepairError(`plan ${planPath}: invalid JSON`);
  }
}

async function cmdApprove(paths, flags, io) {
  if (paths.length !== 1) throw new SettingsError("approve: exactly one plan file");
  const plan = await loadPlan(paths[0]);
  const rationale = flagValue(flags, "--rationale") ?? "approved via CLI";
  const allow = (flagValue(flags, "--allow") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const grant = {
    mechanical: flagBool(flags, "--mechanical"),
    ambiguous: allow,
    rationale,
    decided_by: flagValue(flags, "--by") ?? null,
  };
  if (!grant.mechanical && allow.length === 0) {
    throw new RepairError("approve: grant nothing? pass --mechanical and/or --allow NAME[,NAME]");
  }
  const approved = approvePlan(plan, grant);
  const json = JSON.stringify(approved, null, 2);
  const out = flagValue(flags, "--out") ?? paths[0];
  await writeFile(out, `${json}\n`);
  io.out(`empty-linter: plan ${approved.plan_hash.slice(0, 12)}… approved (${approved.items.filter((i) => i.decision === "approved").length} item(s) granted) → ${out}`);
  return io.exit(0);
}

async function cmdRefuse(paths, flags, io) {
  if (paths.length !== 1) throw new SettingsError("refuse: exactly one plan file");
  const plan = await loadPlan(paths[0]);
  const reason = flagValue(flags, "--reason");
  if (!reason) throw new RepairError("refuse: --reason is required (refusals are recorded)");
  const refused = refusePlan(plan, reason, flagValue(flags, "--by") ?? null);
  const out = flagValue(flags, "--out") ?? paths[0];
  await writeFile(out, `${JSON.stringify(refused, null, 2)}\n`);
  io.out(`empty-linter: plan refused: ${reason} → ${out}`);
  return io.exit(0);
}

async function cmdApply(paths, flags, io) {
  if (paths.length !== 1) throw new SettingsError("apply: exactly one plan file");
  const plan = await loadPlan(paths[0]);
  const outDir = flagValue(flags, "--out");
  if (!outDir) throw new RepairError("apply: --out DIR is required (apply writes to copies only)");
  if (resolve(outDir) === resolve(plan.path)) {
    throw new RepairError("apply: refusing in-place application — Empty-linter never overwrites its input");
  }

  const inputBytes = await readFile(plan.path);
  let inputText;
  try {
    inputText = UTF8_DECODER.decode(inputBytes);
  } catch {
    throw new RepairError(`apply: input ${plan.path} no longer decodes as UTF-8; refusing`);
  }

  const applied = applyPlanToCopy(plan, inputBytes, inputText);

  await mkdir(outDir, { recursive: true });
  const outPath = join(outDir, basename(plan.path));
  if (resolve(outPath) === resolve(plan.path)) {
    throw new RepairError("apply: output path equals input path — refusing in-place application");
  }
  await writeFile(outPath, applied.outputBytes);

  const patch = unifiedDiff(inputText, applied.outputText, `a/${plan.path}`, `b/${basename(outPath)}`);
  const patchPath = join(outDir, `${basename(plan.path)}.patch`);
  await writeFile(patchPath, patch);

  // Immediate rescan of the copy: the provenance record carries it.
  const { record: rescanRecord, verified } = verifyCopy({
    plan,
    outputBytes: applied.outputBytes,
    outputText: applied.outputText,
    rescanFn: (text) => scanText(text, {}),
  });

  const provenance = provenanceRecord({
    plan,
    appliedResult: applied,
    outputPath: outPath,
    operator: process.env.USER ?? process.env.USERNAME ?? null,
    rescan: rescanRecord,
  });
  const provenancePath = join(outDir, "provenance.jsonl");
  const existing = existsSync(provenancePath) ? await readFile(provenancePath, "utf-8") : "";
  await writeFile(provenancePath, `${existing}${JSON.stringify(provenance)}\n`);

  io.out(`empty-linter: applied ${applied.appliedEdits}/${plan.items.filter((i) => i.decision === "approved").length} approved change(s)`);
  io.out(`  copy:       ${outPath}`);
  io.out(`  patch:      ${patchPath}`);
  io.out(`  provenance: ${provenancePath}`);
  io.out(`  rescan:     ${verified ? "verified — only deliberately-kept findings remain" : "UNEXPECTED FINDINGS REMAIN"}`);
  return io.exit(verified ? 0 : EXIT_FINDINGS);
}

async function cmdVerify(paths, flags, io) {
  if (paths.length !== 1) throw new SettingsError("verify: exactly one provenance.jsonl file");
  const raw = await readFile(paths[0], "utf-8");
  const lines = raw.split("\n").filter((l) => l.trim() !== "");
  let allVerified = true;
  let index = 0;
  for (const line of lines) {
    index += 1;
    let prov;
    try {
      prov = JSON.parse(line);
    } catch {
      io.error(`empty-linter: provenance line ${index}: invalid JSON`);
      return io.exit(EXIT_ERROR);
    }
    const outputBytes = await readFile(prov.output_path);
    const actualHash = sha256Hex(outputBytes);
    if (actualHash !== prov.output.sha256) {
      io.error(`empty-linter: ${prov.output_path}: hash drift — expected ${prov.output.sha256.slice(0, 12)}… got ${actualHash.slice(0, 12)}…; refusing to certify`);
      allVerified = false;
      continue;
    }
    let outputText;
    try {
      outputText = UTF8_DECODER.decode(outputBytes);
    } catch {
      io.error(`empty-linter: ${prov.output_path}: output no longer decodes as UTF-8; refusing to certify`);
      allVerified = false;
      continue;
    }
    // Independent rescan: finding names must be exactly the plan's kept set.
    const { findings } = scanText(outputText, {});
    const expectedNames = (prov.kept ?? []).map((k) => k.name).sort((a, b) => a.localeCompare(b));
    const actualNames = findings.map((f) => f.name).sort((a, b) => a.localeCompare(b));
    const unexpected = [];
    {
      const counts = new Map();
      for (const name of expectedNames) counts.set(name, (counts.get(name) ?? 0) - 1);
      for (const name of actualNames) counts.set(name, (counts.get(name) ?? 0) + 1);
      for (const [name, count] of counts) {
        if (count > 0) unexpected.push({ name, extra: count, description: `${count} unexpected ${name} finding(s) in repaired copy` });
      }
    }
    const verified = unexpected.length === 0;
    const record = {
      schema: "https://hyperpolymath.dev/schemas/empty-linter/rescan.v1.json",
      plan_hash: prov.rescan?.plan_hash ?? "",
      path: prov.path,
      output_sha256: actualHash,
      expected_residual_names: expectedNames,
      actual_finding_names: actualNames,
      expected_residual: expectedNames.length,
      actual_findings: findings.length,
      unexpected,
      verified,
      rescanned_at: new Date().toISOString(),
    };
    const reportDir = flagValue(flags, "--report-dir") ?? (paths[0].endsWith(".jsonl") ? paths[0].slice(0, -".jsonl".length) : `${paths[0]}.rescan`);
    await mkdir(reportDir, { recursive: true });
    const recordPath = join(reportDir, `rescan-${String(index).padStart(3, "0")}.json`);
    await writeFile(recordPath, `${JSON.stringify(record, null, 2)}\n`);
    io.out(`empty-linter: ${prov.path}: ${verified ? "VERIFIED" : "RESIDUAL MISMATCH"} (record: ${recordPath})`);
    if (!verified) allVerified = false;
  }
  return io.exit(allVerified ? 0 : EXIT_FINDINGS);
}

// ── usage ─────────────────────────────────────────────────────────────────────

function usage(io) {
  io.out(`empty-linter ${TOOL_VERSION} — negative-space diagnostics

Usage: bun run src/cli/Main.bun.js <command> [options]

Commands:
  audit [path …]     Read-only scan (default). Exit 1 at/above --threshold.
  show <file>        Render invisible characters visibly (formatting marks).
  plan <file>        Propose a repair plan (JSON; mutates nothing).
  approve <plan>     Grant: --mechanical and/or --allow NAME[,NAME]
                     [--rationale TEXT] [--by WHO] [--out FILE]
  refuse <plan>      Record refusal: --reason TEXT [--by WHO] [--out FILE]
  apply <plan>       Apply approved plan to COPIES: --out DIR
  verify <prov.jsonl>  Rescan outputs, emit rescan records [--report-dir DIR]
  tui                Interactive terminal UI.

Audit options:
  --threshold critical|error|warning|info   (default: config or critical)
  --format text|json|hex                    (default: config or text)
  --all-files              Scan every UTF-8-decodable file
  --extensions .a,.b       Override the extension set
  --workspace NAME         Apply workspace constraints from settings
  --config FILE            Settings file (.ncl or .json; default ./config.ncl)
  --no-config              Ignore settings files
  --context N              Escaped-context radius (scalars)
  --no-zalgo / --zalgo-max N

Truth conditions: scanner errors exit 2 distinctly from findings; audit never
mutates input; semantic characters are never auto-repaired; apply never writes
over input.`);
}

await main(process.argv.slice(2));
