// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Jonathan D.A. Jewell

import { expect, test } from "bun:test";
import {
  actionForFinding, approvePlan, applyPlanToCopy, proposePlan,
  provenanceRecord, refusePlan, RepairError, sha256Hex, unifiedDiff, verifyCopy,
} from "../src/core/Repair.bun.js";
import { scanText } from "../src/core/ScalarScanner.bun.js";
import { defaultSettings } from "../src/core/Settings.bun.js";
import { CATALOGUE_VERSION } from "../src/core/UnicodeData.bun.js";

const NBSP = String.fromCodePoint(0x00a0);
const ZWJ = String.fromCodePoint(0x200d);
const FIXED_NOW = new Date("2026-09-21T12:00:00.000Z");

function makePlan(text) {
  const inputBytes = new TextEncoder().encode(text);
  const { findings } = scanText(text, {});
  return proposePlan({
    path: "sample.txt",
    inputBytes,
    inputText: text,
    findings,
    settings: defaultSettings(),
    toolVersion: "0.2.0",
    catalogueVersion: CATALOGUE_VERSION,
    profile: null,
    now: FIXED_NOW,
  });
}

// ── State machine ─────────────────────────────────────────────────────────────

test("propose: plan records input hash, items, and proposed state", () => {
  const plan = makePlan(`network${NBSP}layer`);
  expect(plan.state).toBe("proposed");
  expect(plan.input.sha256).toBe(sha256Hex(new TextEncoder().encode(`network${NBSP}layer`)));
  expect(plan.items.length).toBe(1);
  expect(plan.items[0].action).toBe("replace-space");
  expect(plan.items[0].grant_class).toBe("mechanical");
  expect(plan.plan_hash).toMatch(/^[0-9a-f]{64}$/);
});

test("approve: mechanical blanket grant approves only mechanical items", () => {
  const plan = makePlan(`a${NBSP}b${ZWJ}c`);
  const approved = approvePlan(plan, { mechanical: true, ambiguous: [], rationale: "r" }, FIXED_NOW);
  const byName = Object.fromEntries(approved.items.map((i) => [i.finding.name, i]));
  expect(byName.NBSP.decision).toBe("approved");
  expect(byName.ZWJ.decision).toBe("refused"); // semantic: never auto-repaired
  expect(approved.approval.grants.mechanical).toBe(true);
});

test("approve: ambiguous items need per-name grants", () => {
  const IDEOGRAPHIC = String.fromCodePoint(0x3000); // ambiguous, replace-space
  const plan = makePlan(`x${NBSP}${IDEOGRAPHIC}y`);
  const approved = approvePlan(plan, { mechanical: false, ambiguous: ["IDEOGRAPHIC SPACE"], rationale: "plain CJK source" }, FIXED_NOW);
  const byName = Object.fromEntries(approved.items.map((i) => [i.finding.name, i]));
  expect(byName["IDEOGRAPHIC SPACE"].decision).toBe("approved");
  expect(byName.NBSP.decision).toBe("kept"); // mechanical without grant stays put
});

test("approve/refuse: state transitions are enforced", () => {
  const plan = makePlan(`a${NBSP}b`);
  expect(() => applyPlanToCopy(plan, new TextEncoder().encode(`a${NBSP}b`), `a${NBSP}b`)).toThrow(RepairError);
  const refused = refusePlan(plan, "not today", "reviewer", FIXED_NOW);
  expect(refused.state).toBe("refused");
  expect(() => approvePlan(refused, { mechanical: true, rationale: "x" })).toThrow(RepairError);
});

test("apply: input drift refuses to act", () => {
  const original = `a${NBSP}b`;
  const plan = approvePlan(makePlan(original), { mechanical: true, ambiguous: [], rationale: "r" }, FIXED_NOW);
  expect(() => applyPlanToCopy(plan, new TextEncoder().encode("changed"), "changed")).toThrow(/input drifted/);
});

test("apply: mechanical edit lands exactly once, output hashed", () => {
  const original = `a${NBSP}b${NBSP}c`;
  const plan = approvePlan(makePlan(original), { mechanical: true, ambiguous: [], rationale: "r" }, FIXED_NOW);
  const applied = applyPlanToCopy(plan, new TextEncoder().encode(original), original);
  expect(applied.outputText).toBe("a b c");
  expect(applied.appliedEdits).toBe(2);
  const prov = provenanceRecord({ plan, appliedResult: applied, outputPath: "out/sample.txt", now: FIXED_NOW });
  expect(prov.output.sha256).toBe(sha256Hex(applied.outputBytes));
  expect(prov.kept.length).toBe(0);
});

test("verify: rescan of a good copy verifies; a dirty copy fails distinctly", () => {
  const original = `a${NBSP}${ZWJ}b`;
  const plan = approvePlan(makePlan(original), { mechanical: true, ambiguous: [], rationale: "r" }, FIXED_NOW);
  const applied = applyPlanToCopy(plan, new TextEncoder().encode(original), original);
  const good = verifyCopy({ plan, outputBytes: applied.outputBytes, outputText: applied.outputText, rescanFn: (t) => scanText(t, {}), now: FIXED_NOW });
  expect(good.verified).toBe(true);
  expect(good.record.expected_residual_names).toEqual(["ZWJ"]);

  const dirtyText = applied.outputText + NBSP; // introduce a fresh invisible
  const dirtyBytes = new TextEncoder().encode(dirtyText);
  const dirty = verifyCopy({ plan, outputBytes: dirtyBytes, outputText: dirtyText, rescanFn: (t) => scanText(t, {}), now: FIXED_NOW });
  expect(dirty.verified).toBe(false);
  expect(dirty.record.unexpected[0].name).toBe("NBSP");
});

test("actionForFinding: the conservative policy in one table", () => {
  expect(actionForFinding({ safety: "semantic", fix: { kind: "keep" } }).action).toBe("keep");
  expect(actionForFinding({ safety: "mechanical", fix: { kind: "remove" } }).action).toBe("remove");
  expect(actionForFinding({ safety: "mechanical", fix: { kind: "replace", with: " " } }).action).toBe("replace-space");
  expect(actionForFinding({ safety: "ambiguous", fix: { kind: "review" } }).action).toBe("keep");
});

// ── Unified diff ──────────────────────────────────────────────────────────────

test("unifiedDiff: identical inputs produce no patch", () => {
  expect(unifiedDiff("same\n", "same\n")).toBe("-- no differences --\n");
});

test("unifiedDiff: single-line change with context, no unrelated lines", () => {
  const a = "one\ntwo\nthree\nfour\nfive\nsix\nseven\n";
  const b = "one\ntwo\nthree\nFOUR\nfive\nsix\nseven\n";
  const patch = unifiedDiff(a, b);
  expect(patch).toContain("@@ -1,7 +1,7 @@");
  expect(patch).toContain("-four");
  expect(patch).toContain("+FOUR");
  expect(patch).toContain(" one\n");
  expect(patch).not.toContain("-seven");
});

test("unifiedDiff: insertion in the middle", () => {
  const patch = unifiedDiff("a\nc\n", "a\nb\nc\n");
  const body = patch.split("\n").filter((l) => /^[+-]/.test(l) && !/^(---|\+\+\+)/.test(l));
  expect(body).toEqual(["+b"]);
});

test("unifiedDiff: deletion at the end", () => {
  const patch = unifiedDiff("a\nb\nc\n", "a\nb\n");
  expect(patch).toContain("-c");
  const additions = patch.split("\n").filter((l) => l.startsWith("+") && !l.startsWith("+++"));
  expect(additions).toEqual([]);
});
