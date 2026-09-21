// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Jonathan D.A. Jewell

import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { NickelSubset, SettingsError, defaultSettings, loadSettingsFile, validateAndMerge } from "../src/core/Settings.bun.js";

const REPO_CONFIG = new URL("../config.ncl", import.meta.url).pathname;

function load(path) {
  return loadSettingsFile(path, (p) => readFileSync(p, "utf-8"));
}

// ── The repository's own config.ncl is the live settings file ─────────────────

test("settings: the repo config.ncl parses and becomes active settings", () => {
  const { settings, source } = load(REPO_CONFIG);
  expect(source).toBe(REPO_CONFIG);
  expect(settings.linter.min_severity).toBe("warning"); // 'Warning mapped lowercase
  expect(settings.linter.auto_fix).toBe(false); // conservative default preserved
  expect(settings.linter.target_dir).toBe(".");
  // transform profiles
  expect(settings.transform.strict.max_blank_lines).toBe(1);
  expect(settings.transform.default.ensure_final_newline).toBe(true);
  expect(settings.transform.minimal.trim_lines).toBe(false);
  // workspaces and their constraints
  expect(settings.workspaces.twitter.constraints.max_chars).toBe(280);
  expect(settings.workspaces.linkedin.transform).toBe("default");
  expect(settings.workspaces.email.transform).toBe("default");
  // artefact overrides parsed from the Nickel table
  const nbsp = settings.linter.artifacts.find((a) => a.code_point === 0xa0);
  expect(nbsp).toBeDefined();
  expect(nbsp.name).toBe("NBSP");
  expect(nbsp.severity).toBe("error");
  expect(nbsp.fix_action).toBe("replace:20");
  const zwj = settings.linter.artifacts.find((a) => a.code_point === 0x200d);
  expect(zwj.fix_action).toBe("keep");
});

test("settings: unknown nested keys warn, known structure passes", () => {
  const { warnings } = load(REPO_CONFIG);
  // linter.overlay_color is a legacy key we knowingly warn about
  expect(warnings.some((w) => w.includes("overlay_color"))).toBe(true);
});

// ── Nickel subset: supported shapes ──────────────────────────────────────────

test("settings: enum declarations, records, arrays, strings, numbers, booleans", () => {
  const text = `
let Severity = [| 'Critical, 'Error |] in
{
  linter = {
    min_severity = 'Error,
    auto_fix = false,
    exclude_paths = [ "a", "b" ],
    target_dir = "src",
  },
  scanner = { zalgo = { enabled = true, max_combining = 6 } },
}`;
  const raw = new NickelSubset(text, "mem.ncl").parseDocument();
  expect(raw.linter.min_severity).toEqual({ __enum: "Error" });
  const { settings } = validateAndMerge(raw, "mem.ncl");
  expect(settings.linter.min_severity).toBe("error");
  expect(settings.scanner.zalgo.max_combining).toBe(6);
});

test("settings: validation errors aggregate with dotted paths", () => {
  const raw = {
    linter: { min_severity: "purple", auto_fix: "yes", exclude_paths: [1] },
    scanner: { zalgo: { max_combining: 1 } },
  };
  let thrown = null;
  try {
    validateAndMerge(raw, "t");
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(SettingsError);
  expect(thrown.message).toContain("linter.min_severity");
  expect(thrown.message).toContain("linter.auto_fix");
  expect(thrown.message).toContain("linter.exclude_paths");
  expect(thrown.message).toContain("scanner.zalgo.max_combining");
});

test("settings: unsupported Nickel features fail distinctly, never silently", () => {
  const cases = [
    "let f = fun x => x in { linter = {} }", // functions
    '{ linter = { target_dir = "%{interpolation}" } }',
    "import \"other.ncl\"",
    "{ linter = { target_dir = \"a\" } } extra",
  ];
  for (const text of cases) {
    expect(() => new NickelSubset(text, "x.ncl").parseDocument()).toThrow(SettingsError);
  }
});

test("settings: workspace transform references must resolve", () => {
  const raw = { workspaces: { n: { constraints: { max_chars: 10 }, transform: "missing" } } };
  expect(() => validateAndMerge(raw, "t")).toThrow(/unknown transform profile/);
});

test("settings: defaults are complete and isolated per call", () => {
  const a = defaultSettings();
  const b = defaultSettings();
  a.linter.exclude_paths.push("mutated");
  expect(b.linter.exclude_paths).not.toContain("mutated");
  expect(a.scanner.zalgo.max_combining).toBe(4);
});

test("settings: artefact overrides validate hex and fix actions", () => {
  const raw = { linter: { artifacts: [{ name: "X", hex: "0xZZ", severity: "error", fix_action: "remove" }] } };
  expect(() => validateAndMerge(raw, "t")).toThrow(/hex/);
  const raw2 = { linter: { artifacts: [{ name: "X", hex: "0x200B", severity: "error", fix_action: "obliterate" }] } };
  expect(() => validateAndMerge(raw2, "t")).toThrow(/fix_action/);
});

test("settings: JSON-shaped objects are accepted with the same shape", () => {
  const { settings } = validateAndMerge({ linter: { min_severity: "info" }, scanner: { extensions: ["md", ".rst"] } }, "x.json");
  expect(settings.linter.min_severity).toBe("info");
  expect(settings.scanner.extensions).toEqual([".md", ".rst"]);
});
