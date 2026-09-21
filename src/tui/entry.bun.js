// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Jonathan D.A. Jewell
//
// entry.bun.js — the TUI's IO shell. Owns all impurity: initial scan, raw
// terminal mode, frame painting, and execution of model intents (plan /
// apply / quit). The model stays pure; every intent is executed exactly once
// and answered with exactly one event.

import { collectFiles, scanFile, applyDetectorToggles, DEFAULT_IGNORED_DIRECTORIES } from "../core/ScannerIO.bun.js";
import { defaultSettings } from "../core/Settings.bun.js";
import { CATALOGUE_VERSION } from "../core/UnicodeData.bun.js";
import { approvePlan, applyPlanToCopy, proposePlan, provenanceRecord, verifyCopy } from "../core/Repair.bun.js";
import { scanText } from "../core/ScalarScanner.bun.js";
import { applyArtifactOverrides, resolveSettings } from "../cli/Main.bun.js";
import { initialState, reduce, planReady, applyDone, operationFailed } from "./model.bun.js";
import { renderFrame } from "./render.bun.js";
import { decodeKeys } from "./keys.bun.js";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { TOOL_VERSION } from "../core/Version.bun.js";

const UTF8_DECODER = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
const ALT_SCREEN_ON = "\u001b[?1049h\u001b[H";
const ALT_SCREEN_OFF = "\u001b[?1049l\u001b[0m";
const HIDE_CURSOR = "\u001b[?25l";
const SHOW_CURSOR = "\u001b[?25h";

export async function runTui(args, flags, io) {
  if (!process.stdout.isTTY) {
    io.error("empty-linter tui: needs a TTY (use `audit --format text` for pipes)");
    return io.exit(2);
  }

  // Initial read-only scan, same engine and settings as the CLI.
  const { settings } = resolveSettings(flags, io);
  const scannerOptions = {
    zalgo: settings.scanner.zalgo.enabled,
    zalgoMaxCombining: settings.scanner.zalgo.max_combining,
    contextRadius: settings.scanner.context_radius,
  };
  const ignored = new Set([...DEFAULT_IGNORED_DIRECTORIES, ...settings.linter.exclude_paths]);
  const roots = args.length > 0 ? args : [settings.linter.target_dir ?? "."];
  const files = await collectFiles(roots, { extensions: settings.scanner.extensions, ignoredDirectories: ignored });

  const results = [];
  const errors = [];
  for (const path of files) {
    const result = await scanFile(path, { scannerOptions });
    if (result.kind === "error") {
      errors.push(`${path}: ${result.error}`);
      continue;
    }
    let findings = applyDetectorToggles(result.findings, settings.scanner);
    findings = applyArtifactOverrides(findings, settings.linter.artifacts);
    if (findings.length > 0) results.push({ path, findings, scannedScalars: result.scannedScalars });
  }

  if (errors.length > 0) {
    for (const error of errors) io.error(`empty-linter: ${error}`);
    io.error("empty-linter: files that cannot be scanned fail distinctly from findings");
    return io.exit(2);
  }

  let state = initialState(results, {
    settingsSource: "config.ncl/defaults",
    threshold: settings.linter.min_severity ?? "critical",
  });

  const stdout = process.stdout;
  const stdin = process.stdin;
  stdin.setRawMode?.(true);
  stdout.write(ALT_SCREEN_ON + HIDE_CURSOR);

  const paint = () => {
    const width = stdout.columns ?? 100;
    const height = stdout.rows ?? 30;
    const frame = renderFrame(state, { width, height });
    stdout.write("\u001b[H" + frame.join("\r\n"));
  };

  const executeEffect = async (effect) => {
    if (effect.type === "quit") return "quit";
    if (effect.type === "plan") {
      try {
        const bytes = await readFile(effect.path);
        const text = UTF8_DECODER.decode(bytes);
        const { findings } = scanText(text, scannerOptions);
        const plan = proposePlan({
          path: effect.path,
          inputBytes: bytes,
          inputText: text,
          findings: applyArtifactOverrides(applyDetectorToggles(findings, settings.scanner), settings.linter.artifacts),
          settings,
          toolVersion: TOOL_VERSION,
          catalogueVersion: CATALOGUE_VERSION,
          profile: null,
        });
        state = planReady(state, plan);
      } catch (error) {
        state = operationFailed(state, error.message);
      }
      return "continue";
    }
    if (effect.type === "apply") {
      try {
        const grant = {
          mechanical: effect.grant.mechanical === true,
          ambiguous: effect.grant.ambiguous === "all-in-plan"
            ? [...new Set(effect.plan.items.filter((i) => i.grant_class === "ambiguous").map((i) => i.finding.name))]
            : effect.grant.ambiguous,
          rationale: effect.grant.rationale,
          decided_by: process.env.USER ?? process.env.USERNAME ?? "tui-user",
        };
        const approved = approvePlan(effect.plan, grant);
        const inputBytes = await readFile(approved.path);
        const inputText = UTF8_DECODER.decode(inputBytes);
        const applied = applyPlanToCopy(approved, inputBytes, inputText);
        const outDir = resolve("empty-linter-out");
        await mkdir(outDir, { recursive: true });
        const outPath = join(outDir, basename(approved.path));
        if (resolve(outPath) === resolve(approved.path)) {
          throw new Error("refusing in-place application");
        }
        await writeFile(outPath, applied.outputBytes);
        const { record: rescanRecord, verified } = verifyCopy({
          plan: approved,
          outputBytes: applied.outputBytes,
          outputText: applied.outputText,
          rescanFn: (t) => scanText(t, scannerOptions),
        });
        const provenance = provenanceRecord({
          plan: approved,
          appliedResult: applied,
          outputPath: outPath,
          operator: grant.decided_by,
          rescan: rescanRecord,
        });
        const provenancePath = join(outDir, "provenance.jsonl");
        const prior = await readFile(provenancePath, "utf-8").catch(() => "");
        await writeFile(provenancePath, `${prior}${JSON.stringify(provenance)}\n`);
        state = applyDone(state, { verified, outputPath: outPath, appliedEdits: applied.appliedEdits, rescanRecord });
      } catch (error) {
        state = operationFailed(state, error.message);
      }
      return "continue";
    }
    return "continue";
  };

  try {
    paint();
    for await (const chunk of stdin) {
      const keys = decodeKeys(new Uint8Array(chunk));
      for (const key of keys) {
        state = reduce(state, key);
      }
      const effects = state.effects;
      state = { ...state, effects: [] };
      let quit = false;
      for (const effect of effects) {
        // eslint-disable-next-line no-await-in-loop -- intents execute in order, one at a time
        if ((await executeEffect(effect)) === "quit") quit = true;
      }
      if (quit) break;
      paint();
    }
  } finally {
    stdout.write(SHOW_CURSOR + ALT_SCREEN_OFF);
    stdin.setRawMode?.(false);
  }
  return io.exit(0);
}
