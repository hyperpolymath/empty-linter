// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Jonathan D.A. Jewell
//
// Settings.bun.js — active settings loading and validation.
//
// Issue #74: "Load and validate settings; the existing Nickel file is
// currently data, not an active configuration path." This module makes
// `config.ncl` the live configuration of the linter.
//
// Because CI guarantees only Bun (not a Nickel interpreter), this module
// implements a purpose-built evaluator for the declarative subset of Nickel
// that `config.ncl` uses: let-bindings, enum type declarations, records,
// arrays, strings, numbers, booleans, and enum literals. It is deliberately
// strict: any real Nickel computation (functions, interpolation, merges,
// imports) is a *load error*, never silently mis-read. A `.json` settings
// file with the same shape is also accepted, for generated/exchanged config.
//
// Precedence (lowest to highest): built-in defaults < settings file < CLI flags.

export class SettingsError extends Error {}

const SEVERITIES = new Set(["critical", "error", "warning", "info"]);
const FIX_ACTIONS = new Set(["remove", "keep", "review"]); // plus "replace:XX"
const OUTPUT_FORMATS = new Set(["text", "json", "hex"]);
const LINE_ENDINGS = new Set(["LF", "CRLF", "CR"]);

// ── Defaults ──────────────────────────────────────────────────────────────────

export function defaultSettings() {
  return {
    linter: {
      target_dir: ".",
      // Built-in default matches the stable CI shim; config.ncl may loosen it.
      min_severity: "critical",
      output_format: "text",
      auto_fix: false,
      exclude_paths: ["node_modules", ".git", "lib", "dist", "build", ".cache"],
      artifacts: [],
    },
    scanner: {
      extensions: null, // null → CLI default extension set
      catalogue: true,
      bidi: true,
      tags: true,
      variation_selectors: true,
      zalgo: { enabled: true, max_combining: 4 },
      context_radius: 12,
    },
    transform: {
      default: defaultProfile(2, true),
      strict: defaultProfile(1, true),
      minimal: { ...defaultProfile(100, false), trim_lines: false, trim_document: false, collapse_spaces: false },
    },
    workspaces: {},
    provenance: { record_operator: true },
  };
}

function defaultProfile(maxBlankLines, ensureNewline) {
  return {
    trim_lines: true,
    trim_document: true,
    collapse_spaces: true,
    normalize_line_endings: true,
    target_line_ending: "LF",
    max_blank_lines: maxBlankLines,
    remove_invisibles: true,
    ensure_final_newline: ensureNewline,
  };
}

// ── Public loader ─────────────────────────────────────────────────────────────

/**
 * Load settings from a `.ncl` or `.json` file, validate them, and merge over
 * the built-in defaults.
 *
 * @param {string} path File path (caller decides existence).
 * @returns {{settings: object, source: string, warnings: string[]}}
 * @throws {SettingsError} on any parse, evaluation, or validation failure.
 */
export function loadSettingsFile(path, readText) {
  const text = readText(path);
  let raw;
  if (path.endsWith(".json")) {
    try {
      raw = JSON.parse(text);
    } catch (error) {
      throw new SettingsError(`settings ${path}: invalid JSON: ${error.message}`);
    }
  } else {
    const parser = new NickelSubset(text, path);
    raw = parser.parseDocument();
  }
  return validateAndMerge(raw, path);
}

/**
 * Validate a raw settings object and merge it over defaults.
 * All problems are collected and thrown as one SettingsError so a user sees
 * every misconfiguration in one pass.
 */
export function validateAndMerge(raw, source = "settings") {
  const problems = [];
  const warnings = [];
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new SettingsError(`${source}: top level must be a record/object`);
  }

  const defaults = defaultSettings();
  const out = {
    linter: { ...defaults.linter, exclude_paths: [...defaults.linter.exclude_paths], artifacts: [] },
    scanner: { ...defaults.scanner, zalgo: { ...defaults.scanner.zalgo } },
    transform: {
      default: { ...defaults.transform.default },
      strict: { ...defaults.transform.strict },
      minimal: { ...defaults.transform.minimal },
    },
    workspaces: {},
    provenance: { ...defaults.provenance },
  };

  const at = (path) => `${source}: ${path}`;

  if (raw.linter !== undefined) {
    const l = expectRecord(raw.linter, "linter", problems);
    if (l) {
      if (l.target_dir !== undefined) out.linter.target_dir = expectString(l.target_dir, "linter.target_dir", problems);
      if (l.min_severity !== undefined) {
        out.linter.min_severity = expectEnumString(l.min_severity, "linter.min_severity", SEVERITIES, problems);
      }
      if (l.output_format !== undefined) {
        out.linter.output_format = expectEnumString(l.output_format, "linter.output_format", OUTPUT_FORMATS, problems);
      }
      if (l.auto_fix !== undefined) out.linter.auto_fix = expectBool(l.auto_fix, "linter.auto_fix", problems);
      if (l.exclude_paths !== undefined) {
        out.linter.exclude_paths = expectStringArray(l.exclude_paths, "linter.exclude_paths", problems);
      }
      if (l.artifacts !== undefined) {
        out.linter.artifacts = parseArtifacts(l.artifacts, problems);
      }
      unknownKeys(l, ["target_dir", "min_severity", "output_format", "auto_fix", "exclude_paths", "artifacts"], "linter", warnings);
    }
  }

  if (raw.scanner !== undefined) {
    const s = expectRecord(raw.scanner, "scanner", problems);
    if (s) {
      if (s.extensions !== undefined && s.extensions !== null) {
        out.scanner.extensions = expectStringArray(s.extensions, "scanner.extensions", problems)
          .map((e) => (e.startsWith(".") ? e.toLowerCase() : `.${e.toLowerCase()}`));
      } else if (s.extensions === null) {
        out.scanner.extensions = null;
      }
      for (const key of ["catalogue", "bidi", "tags", "variation_selectors"]) {
        if (s[key] !== undefined) out.scanner[key] = expectBool(s[key], `scanner.${key}`, problems);
      }
      if (s.zalgo !== undefined) {
        const z = expectRecord(s.zalgo, "scanner.zalgo", problems);
        if (z) {
          if (z.enabled !== undefined) out.scanner.zalgo.enabled = expectBool(z.enabled, "scanner.zalgo.enabled", problems);
          if (z.max_combining !== undefined) {
            out.scanner.zalgo.max_combining = expectInt(z.max_combining, "scanner.zalgo.max_combining", problems, 2, 64);
          }
        }
      }
      if (s.context_radius !== undefined) {
        out.scanner.context_radius = expectInt(s.context_radius, "scanner.context_radius", problems, 0, 80);
      }
      unknownKeys(s, ["extensions", "catalogue", "bidi", "tags", "variation_selectors", "zalgo", "context_radius"], "scanner", warnings);
    }
  }

  if (raw.transform !== undefined) {
    const t = expectRecord(raw.transform, "transform", problems);
    if (t) {
      for (const [name, value] of Object.entries(t)) {
        const profile = expectRecord(value, `transform.${name}`, problems);
        if (!profile) continue;
        const base = name in out.transform ? out.transform[name] : defaultProfile(2, true);
        out.transform[name] = parseProfile(profile, base, `transform.${name}`, problems);
      }
    }
  }

  if (raw.workspaces !== undefined) {
    const w = expectRecord(raw.workspaces, "workspaces", problems);
    if (w) {
      for (const [name, value] of Object.entries(w)) {
        const ws = expectRecord(value, `workspaces.${name}`, problems);
        if (!ws) continue;
        const parsed = { constraints: {}, transform: null };
        if (ws.transform !== undefined) {
          const profileRef = expectString(ws.transform, `workspaces.${name}.transform`, problems);
          if (profileRef !== undefined) {
            parsed.transform = profileRef;
          }
        }
        if (ws.constraints !== undefined) {
          const c = expectRecord(ws.constraints, `workspaces.${name}.constraints`, problems);
          if (c) {
            for (const [key, limit] of [["max_chars", c.max_chars], ["max_words", c.max_words], ["max_lines", c.max_lines]]) {
              if (limit !== undefined) {
                parsed.constraints[key] = expectInt(limit, `workspaces.${name}.constraints.${key}`, problems, 1, 1_000_000);
              }
            }
          }
        }
        out.workspaces[name] = parsed;
      }
    }
  }

  if (raw.provenance !== undefined) {
    const p = expectRecord(raw.provenance, "provenance", problems);
    if (p && p.record_operator !== undefined) {
      out.provenance.record_operator = expectBool(p.record_operator, "provenance.record_operator", problems);
    }
  }

  // Cross-references: workspace.transform must name a defined profile.
  for (const [name, ws] of Object.entries(out.workspaces)) {
    if (ws.transform !== null && !(ws.transform in out.transform)) {
      problems.push(at(`workspaces.${name}.transform: unknown transform profile "${ws.transform}"`));
    }
  }

  if (problems.length > 0) {
    throw new SettingsError(`invalid settings:\n  - ${problems.join("\n  - ")}`);
  }
  return { settings: out, source, warnings };
}

// ── Artefact override table ───────────────────────────────────────────────────

function parseArtifacts(value, problems) {
  if (!Array.isArray(value)) {
    problems.push("linter.artifacts: must be an array");
    return [];
  }
  const parsed = [];
  value.forEach((item, index) => {
    const where = `linter.artifacts[${index}]`;
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      problems.push(`${where}: must be a record`);
      return;
    }
    const name = expectString(item.name, `${where}.name`, problems);
    let codePoint;
    if (typeof item.hex === "string") {
      const match = /^0[xX]([0-9a-fA-F]{1,6})$/.exec(item.hex.trim());
      if (match) codePoint = Number.parseInt(match[1], 16);
    }
    if (codePoint === undefined || codePoint < 0 || codePoint > 0x10ffff) {
      problems.push(`${where}.hex: must look like "0x00A0" naming a Unicode scalar`);
    }
    const severity = expectEnumString(item.severity, `${where}.severity`, SEVERITIES, problems);
    let fixAction = item.fix_action;
    const fixOk = typeof fixAction === "string" &&
      (FIX_ACTIONS.has(fixAction) || /^replace:[0-9a-fA-F]{2,6}$/.test(fixAction));
    if (!fixOk) problems.push(`${where}.fix_action: must be remove|keep|review|replace:<hex>`);
    if (name === undefined || codePoint === undefined || severity === undefined || !fixOk) return;
    parsed.push({ name, code_point: codePoint, severity, fix_action: fixAction });
  });
  return parsed;
}

function parseProfile(record, base, where, problems) {
  const profile = { ...base };
  for (const key of ["trim_lines", "trim_document", "collapse_spaces", "normalize_line_endings", "remove_invisibles", "ensure_final_newline"]) {
    if (record[key] !== undefined) profile[key] = expectBool(record[key], `${where}.${key}`, problems);
  }
  if (record.target_line_ending !== undefined) {
    profile.target_line_ending = expectEnumString(record.target_line_ending, `${where}.target_line_ending`, LINE_ENDINGS, problems, true);
  }
  if (record.max_blank_lines !== undefined) {
    profile.max_blank_lines = expectInt(record.max_blank_lines, `${where}.max_blank_lines`, problems, 0, 10_000);
  }
  return profile;
}

// ── Expectation helpers ───────────────────────────────────────────────────────

function expectRecord(value, path, problems) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    problems.push(`${path}: must be a record`);
    return null;
  }
  return value;
}

function expectString(value, path, problems) {
  if (typeof value !== "string") {
    problems.push(`${path}: must be a string`);
    return undefined;
  }
  return value;
}

function expectBool(value, path, problems) {
  if (typeof value !== "boolean") {
    problems.push(`${path}: must be true or false`);
    return undefined;
  }
  return value;
}

function expectInt(value, path, problems, min, max) {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    problems.push(`${path}: must be an integer`);
    return undefined;
  }
  if (value < min || value > max) {
    problems.push(`${path}: must be between ${min} and ${max}`);
    return undefined;
  }
  return value;
}

// Nickel enum literals arrive as { __enum: "Name" }; from JSON they may be
// plain strings ("warning"). Accept both, matching case-insensitively
// (Nickel style 'Warning vs JSON style "warning"), and always emit the
// lowercase string.
function expectEnumString(value, path, allowed, problems, preserveCase = false) {
  const name = typeof value === "string" ? value
    : value && typeof value === "object" && typeof value.__enum === "string" ? value.__enum
    : undefined;
  if (name === undefined) {
    problems.push(`${path}: must be one of ${[...allowed].join(", ")}`);
    return undefined;
  }
  const match = [...allowed].find((option) => option.toLowerCase() === name.toLowerCase());
  if (match === undefined) {
    problems.push(`${path}: "${name}" is not one of ${[...allowed].join(", ")}`);
    return undefined;
  }
  return preserveCase ? match : match.toLowerCase();
}

function expectStringArray(value, path, problems) {
  if (!Array.isArray(value) || value.some((v) => typeof v !== "string")) {
    problems.push(`${path}: must be an array of strings`);
    return [];
  }
  return value;
}

function unknownKeys(record, known, path, warnings) {
  for (const key of Object.keys(record)) {
    if (!known.includes(key)) warnings.push(`${path}: unknown key "${key}" ignored`);
  }
}

// ── Nickel declarative-subset parser ─────────────────────────────────────────
//
// Supported: let-bindings (`let x = expr in`), enum type declarations
// (`[| 'A, 'B |]`, evaluated to null), records, arrays, strings, numbers,
// booleans, enum literals ('Name → { __enum: "Name" }), comments (# …).
// Anything else is a hard parse error.

export class NickelSubset {
  constructor(text, source = "config.ncl") {
    this.text = text;
    this.source = source;
    this.pos = 0;
  }

  parseDocument() {
    const env = new Map();
    let value = this.parseSkeleton(env);
    this.skipTrivia();
    if (!this.atEnd()) this.fail(`unexpected trailing content`);
    return value;
  }

  // Parse a sequence of `let` bindings followed by the body expression.
  parseSkeleton(env) {
    this.skipTrivia();
    while (this.peekWord() === "let") {
      this.expectWord("let");
      const name = this.expectIdent();
      this.expectChar("=");
      const bound = this.parseExpr(env);
      env.set(name, bound);
      this.expectWord("in");
      this.skipTrivia();
    }
    return this.parseExpr(env);
  }

  parseExpr(env) {
    this.skipTrivia();
    const ch = this.peek();
    if (ch === "{") return this.parseRecord(env);
    if (ch === "[") {
      // Distinguish an array from an enum type declaration [| 'A |]
      if (this.text.startsWith("[|", this.pos)) return this.parseEnumType();
      return this.parseArray(env);
    }
    if (ch === '"') return this.parseString();
    if (ch === "'") return this.parseEnumLiteral();
    if (ch === "-" || (ch >= "0" && ch <= "9")) return this.parseNumber();
    if (this.peekWord() === "true") { this.expectWord("true"); return true; }
    if (this.peekWord() === "false") { this.expectWord("false"); return false; }
    if (this.peekWord() === "null") { this.expectWord("null"); return null; }
    const word = this.peekWord();
    if (word && /^[A-Za-z_]/.test(word)) {
      this.expectWord(word);
      if (env.has(word)) return env.get(word);
      this.fail(`reference to unknown or unsupported name "${word}" (only let-bound values are supported)`);
    }
    this.fail(`unsupported syntax starting at ${JSON.stringify(this.text.slice(this.pos, this.pos + 24))}`);
  }

  parseRecord(env) {
    this.expectChar("{");
    const record = {};
    for (;;) {
      this.skipTrivia();
      if (this.tryChar("}")) return record;
      const key = this.expectIdent();
      this.expectChar("=");
      record[key] = this.parseSkeleton(env);
      this.skipTrivia();
      this.tryChar(",");
    }
  }

  parseArray(env) {
    this.expectChar("[");
    const array = [];
    for (;;) {
      this.skipTrivia();
      if (this.tryChar("]")) return array;
      array.push(this.parseSkeleton(env));
      this.skipTrivia();
      this.tryChar(",");
    }
  }

  parseEnumType() {
    // [| 'A, 'B |] — an enum *type*; it binds to null (used only in let decls).
    this.pos += 2;
    for (;;) {
      this.skipTrivia();
      if (this.text.startsWith("|]", this.pos)) {
        this.pos += 2;
        return null;
      }
      this.parseEnumLiteral();
      this.skipTrivia();
      this.tryChar(",");
    }
  }

  parseEnumLiteral() {
    this.expectChar("'");
    const name = this.expectIdent("enum name");
    return { __enum: name };
  }

  parseString() {
    this.expectChar('"');
    let out = "";
    for (;;) {
      if (this.atEnd()) this.fail("unterminated string");
      const ch = this.text[this.pos++];
      if (ch === '"') return out;
      if (ch === "\\") {
        if (this.atEnd()) this.fail("unterminated escape");
        const esc = this.text[this.pos++];
        const table = { n: "\n", r: "\r", t: "\t", "\\": "\\", '"': '"', "'": "'" };
        if (esc === "u") {
          this.expectChar("{");
          let hexDigits = "";
          while (!this.atEnd() && this.text[this.pos] !== "}") hexDigits += this.text[this.pos++];
          this.expectChar("}");
          out += String.fromCodePoint(Number.parseInt(hexDigits, 16));
        } else if (esc in table) {
          out += table[esc];
        } else {
          this.fail(`unsupported escape \\${esc}`);
        }
      } else if (ch === "%" && this.text[this.pos] === "{") {
        this.fail("string interpolation %{…} is not supported in settings (keep config declarative)");
      } else {
        out += ch;
      }
    }
  }

  parseNumber() {
    const match = /^-?\d+(\.\d+)?/.exec(this.text.slice(this.pos));
    if (!match) this.fail("malformed number");
    this.pos += match[0].length;
    return match[0].includes(".") ? Number.parseFloat(match[0]) : Number.parseInt(match[0], 10);
  }

  // ── Machinery ───────────────────────────────────────────────────────────────

  skipTrivia() {
    for (;;) {
      while (!this.atEnd() && /\s/.test(this.text[this.pos])) this.pos += 1;
      if (!this.atEnd() && this.text[this.pos] === "#") {
        while (!this.atEnd() && this.text[this.pos] !== "\n") this.pos += 1;
      } else {
        return;
      }
    }
  }

  peek() { return this.text[this.pos]; }
  atEnd() { return this.pos >= this.text.length; }

  peekWord() {
    const match = /^[A-Za-z_][A-Za-z0-9_.'-]*/.exec(this.text.slice(this.pos));
    return match ? match[0] : null;
  }

  expectWord(word) {
    this.skipTrivia();
    if (this.peekWord() !== word) this.fail(`expected "${word}"`);
    this.pos += word.length;
  }

  expectIdent(what = "identifier") {
    this.skipTrivia();
    const word = this.peekWord();
    if (!word || !/^[A-Za-z_]/.test(word)) this.fail(`expected ${what}`);
    this.pos += word.length;
    return word;
  }

  expectChar(ch) {
    this.skipTrivia();
    if (this.text[this.pos] !== ch) this.fail(`expected "${ch}"`);
    this.pos += 1;
  }

  tryChar(ch) {
    this.skipTrivia();
    if (this.text[this.pos] === ch) {
      this.pos += 1;
      return true;
    }
    return false;
  }

  fail(message) {
    const line = this.text.slice(0, this.pos).split("\n").length;
    const lineStart = this.text.lastIndexOf("\n", this.pos - 1) + 1;
    const col = this.pos - lineStart + 1;
    throw new SettingsError(`${this.source}:${line}:${col}: ${message}`);
  }
}
