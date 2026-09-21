// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Jonathan D.A. Jewell
//
// The fast suite validates the validators; the slow suite validates REAL
// emitted records end-to-end against the shipped schema files. Machine output
// that does not satisfy its own schema is a bug class this test closes.

import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { assertSchemaSupported, SchemaError, validate } from "../src/core/SchemaValidator.bun.js";
import { diagnosticRecord, formatTextReport } from "../src/core/Report.bun.js";
import { scanText } from "../src/core/ScalarScanner.bun.js";
import { approvePlan, applyPlanToCopy, proposePlan, provenanceRecord, verifyCopy } from "../src/core/Repair.bun.js";
import { defaultSettings } from "../src/core/Settings.bun.js";
import { CATALOGUE_VERSION } from "../src/core/UnicodeData.bun.js";

const FIXED_NOW = new Date("2026-09-21T12:00:00.000Z");
const NBSP = String.fromCodePoint(0x00a0);

function schema(name) {
  return JSON.parse(readFileSync(new URL(`../schemas/${name}`, import.meta.url), "utf-8"));
}

// ── Validator subset behaviour ────────────────────────────────────────────────

test("validator: types, required, additionalProperties", () => {
  const s = {
    type: "object",
    required: ["a"],
    additionalProperties: false,
    properties: { a: { type: "integer" }, b: { type: "string" } },
  };
  expect(validate({ a: 1 }, s)).toEqual([]);
  expect(validate({}, s).length).toBe(1);
  expect(validate({ a: 1, c: 2 }, s)[0]).toContain('unexpected key "c"');
  expect(validate({ a: "x" }, s)[0]).toContain("expected type integer");
});

test("validator: enum, const, pattern, anyOf, bounds, date-time", () => {
  expect(validate("x", { enum: ["x", "y"] })).toEqual([]);
  expect(validate("z", { enum: ["x", "y"] }).length).toBe(1);
  expect(validate(5, { const: 5 })).toEqual([]);
  expect(validate("ab12", { pattern: "^[a-z]{2}\\d{2}$" })).toEqual([]);
  expect(validate(10, { minimum: 0, maximum: 5 }).length).toBe(1);
  expect(validate("2026-09-21T12:00:00.000Z", { format: "date-time" })).toEqual([]);
  expect(validate("yesterday", { format: "date-time" }).length).toBe(1);
  expect(validate(null, { anyOf: [{ type: "null" }, { type: "string" }] })).toEqual([]);
  expect(validate(3, { anyOf: [{ type: "null" }, { type: "string" }] }).length).toBe(1);
});

test("validator: unsupported schema keywords are a hard load error", () => {
  expect(() => assertSchemaSupported({ type: "string", patternProperties: { "^a": {} } })).toThrow(SchemaError);
});

test("schemas: the four shipped schemas use only the supported subset", () => {
  for (const name of ["diagnostic.v1.json", "repair-plan.v1.json", "provenance.v1.json", "rescan.v1.json"]) {
    assertSchemaSupported(schema(name));
  }
});

// ── Real emitted records satisfy their schemas ────────────────────────────────

test("diagnostic record from a real scan validates", () => {
  const { findings, scannedScalars } = scanText(`the network${NBSP}layer`, {});
  const record = diagnosticRecord({ path: "draft.txt", findings, scannedScalars, now: FIXED_NOW });
  expect(validate(record, schema("diagnostic.v1.json"))).toEqual([]);
});

test("proposed/approved plans validate; provenance and rescan records validate", () => {
  const text = `the network${NBSP}layer`;
  const inputBytes = new TextEncoder().encode(text);
  const { findings } = scanText(text, {});
  const plan = proposePlan({
    path: "draft.txt", inputBytes, inputText: text, findings,
    settings: defaultSettings(), toolVersion: "0.2.0", catalogueVersion: CATALOGUE_VERSION,
    profile: null, now: FIXED_NOW,
  });
  expect(validate(plan, schema("repair-plan.v1.json"))).toEqual([]);

  const approved = approvePlan(plan, { mechanical: true, ambiguous: [], rationale: "copy-edit" }, FIXED_NOW);
  expect(validate(approved, schema("repair-plan.v1.json"))).toEqual([]);

  const applied = applyPlanToCopy(approved, inputBytes, text);
  const { record: rescan } = verifyCopy({ plan: approved, outputBytes: applied.outputBytes, outputText: applied.outputText, rescanFn: (t) => scanText(t, {}), now: FIXED_NOW });
  expect(validate(rescan, schema("rescan.v1.json"))).toEqual([]);

  const prov = provenanceRecord({ plan: approved, appliedResult: applied, outputPath: "out/draft.txt", operator: "tester", now: FIXED_NOW, rescan });
  expect(validate(prov, schema("provenance.v1.json"))).toEqual([]);
});

test("schema stability: diagnostic $id and key inventory are pinned", () => {
  const s = schema("diagnostic.v1.json");
  expect(s.$id).toBe("https://hyperpolymath.dev/schemas/empty-linter/diagnostic.v1.json");
  expect(s.required).toContain("findings");
  const findingProps = Object.keys(s.properties.findings.items.properties).sort();
  expect(findingProps).toContain("byte_offset");
  expect(findingProps).toContain("column");
  expect(findingProps).toContain("safety");
});

test("text report remains available for humans (regression guard)", () => {
  const { findings } = scanText(`x${NBSP}`, {});
  const report = formatTextReport([{ path: "f.txt", findings }]);
  expect(report).toContain("NBSP");
  expect(report).toContain("U+00A0");
});
