// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Jonathan D.A. Jewell

import { expect, test } from "bun:test";
import { consumeDiagnostics, AdapterError } from "../adapters/reference-consumer/reference-consumer.bun.js";
import { diagnosticRecord } from "../src/core/Report.bun.js";
import { scanText } from "../src/core/ScalarScanner.bun.js";

const FIXED_NOW = new Date("2026-09-21T12:00:00.000Z");

function record() {
  const { findings, scannedScalars } = scanText(`the network${String.fromCodePoint(0x00a0)}layer`, {});
  return diagnosticRecord({ path: "draft.txt", findings, scannedScalars, now: FIXED_NOW });
}

test("reference consumer: renders validated markdown for real records", () => {
  const { markdown, records, findings } = consumeDiagnostics([record()]);
  expect(records).toBe(1);
  expect(findings).toBe(1);
  expect(markdown).toContain("# Empty-linter findings");
  expect(markdown).toContain("NBSP");
  expect(markdown).toContain("draft.txt");
});

test("reference consumer: rejects records that do not satisfy the schema", () => {
  const bad = { schema: "https://example.com/wrong", findings: [] };
  expect(() => consumeDiagnostics([bad])).toThrow(AdapterError);
  try {
    consumeDiagnostics([bad]);
  } catch (error) {
    expect(error.message).toContain("diagnostic.v1.json");
    expect(error.message).toContain("Refusing to consume");
  }
});

test("reference consumer: markdown escapes producer text", () => {
  const rec = record();
  rec.path = "evil|path `with` _markdown_ [chars]";
  const { markdown } = consumeDiagnostics([rec]);
  expect(markdown).toContain("evil\\|path");
});
