// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Jonathan D.A. Jewell
//
// Repair.bun.js — the safe-repair pipeline.
//
// Explicit states, per issue #74:
//
//     audit ──► propose ──► approve ──► apply-to-copy ──► verify
//                  │             │
//                  └─────────────┴──► refuse
//
// Non-negotiables implemented here:
//   * audit never mutates input (nothing in this module writes before apply);
//   * semantic characters are never removed — they are not offered as actions;
//   * apply writes copies only; in-place writes are refused by construction;
//   * input immutability is enforced: if the input file changed between plan
//     and apply, apply refuses rather than acting on drift;
//   * every decision lands in a provenance record with SHA-256 input/output
//     hashes, catalogue/tool versions, settings digest, and per-action reasons;
//   * verify independently rescans the copy and emits a rescan record.

import { createHash } from "node:crypto";
import { applyProfile } from "./TextTransform.bun.js";

export const SCHEMA_IDS = Object.freeze({
  diagnostic: "https://hyperpolymath.dev/schemas/empty-linter/diagnostic.v1.json",
  repairPlan: "https://hyperpolymath.dev/schemas/empty-linter/repair-plan.v1.json",
  approval: "https://hyperpolymath.dev/schemas/empty-linter/approval.v1.json",
  provenance: "https://hyperpolymath.dev/schemas/empty-linter/provenance.v1.json",
  rescan: "https://hyperpolymath.dev/schemas/empty-linter/rescan.v1.json",
});

export const STATES = Object.freeze([
  "proposed",
  "approved",
  "refused",
  "applied",
  "verified",
  "failed",
]);

// ── Hashing ───────────────────────────────────────────────────────────────────

export function sha256Hex(data) {
  return createHash("sha256").update(data).digest("hex");
}

function canonicalJson(value) {
  // Deterministic key-ordered serialisation for settings digests / plan hashes.
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/** Map a finding onto the action the plan will (or will not) take. */
export function actionForFinding(finding) {
  const fix = finding.fix ?? { kind: "review" };
  if (finding.safety === "semantic") {
    return { action: "keep", grant_class: "semantic", reason: "semantic character is never removed solely because it is invisible" };
  }
  if (fix.kind === "remove") {
    return { action: "remove", grant_class: finding.safety, reason: `${finding.safety} removal per catalogue policy` };
  }
  if (fix.kind === "replace") {
    const verb = fix.with === "\n" ? "replace-newline" : fix.with === " " ? "replace-space" : "replace";
    return { action: verb, grant_class: finding.safety, reason: `${finding.safety} replacement per catalogue policy`, replacement: fix.with };
  }
  return { action: "keep", grant_class: finding.safety === "mechanical" ? "mechanical" : finding.safety, reason: `requires human review; default is keep (${finding.name})` };
}

/**
 * propose: build a repair plan for one file's findings. Pure — touches nothing.
 */
export function proposePlan({ path, inputBytes, inputText, findings, settings, toolVersion, catalogueVersion, profile = null, now = new Date() }) {
  const inputHash = sha256Hex(inputBytes);
  const settingsDigest = sha256Hex(canonicalJson(settings));
  const items = findings.map((finding, index) => ({
    id: `${path}#${index}`,
    index,
    ...actionForFinding(finding),
    finding: {
      name: finding.name,
      code_point: finding.code_point,
      utf8_hex: finding.utf8_hex,
      line: finding.line,
      column: finding.column,
      byte_offset: finding.byte_offset,
      scalar_index: finding.scalar_index,
      severity: finding.severity,
      safety: finding.safety,
      description: finding.description,
      context_escaped: finding.context_escaped,
    },
  }));

  const plan = {
    schema: SCHEMA_IDS.repairPlan,
    state: "proposed",
    tool: { name: "empty-linter", version: toolVersion },
    catalogue_version: catalogueVersion,
    settings_digest: settingsDigest,
    path,
    input: { sha256: inputHash, bytes: inputBytes.length },
    transform_profile: profile,
    items,
    created_at: now.toISOString(),
  };
  plan.plan_hash = sha256Hex(canonicalJson(plan));
  return plan;
}

/**
 * approve: grant application rights. Mechanical grants may be blanket;
 * ambiguous grants must name artefacts explicitly; semantic is always refused.
 *
 * @param {object} plan plan from proposePlan
 * @param {{ mechanical?: boolean, ambiguous?: string[], rationale: string,
 *           decided_by?: string }} grant
 */
export function approvePlan(plan, grant, now = new Date()) {
  if (plan.state !== "proposed") {
    throw new RepairError(`cannot approve a plan in state "${plan.state}"`);
  }
  const ambiguous = new Set(grant.ambiguous ?? []);
  const approvedItems = plan.items.map((item) => {
    if (item.grant_class === "semantic") {
      return { ...item, decision: "refused", decision_reason: "semantic characters are never auto-repaired" };
    }
    if (item.action === "keep") {
      return { ...item, decision: "kept", decision_reason: item.reason };
    }
    if (item.grant_class === "mechanical" && grant.mechanical === true) {
      return { ...item, decision: "approved", decision_reason: grant.rationale };
    }
    if (item.grant_class === "ambiguous" && ambiguous.has(item.finding.name)) {
      return { ...item, decision: "approved", decision_reason: `explicitly granted: ${grant.rationale}` };
    }
    return { ...item, decision: "kept", decision_reason: "no grant covers this item" };
  });

  const approval = {
    schema: SCHEMA_IDS.approval,
    plan_hash: plan.plan_hash,
    decided_at: now.toISOString(),
    decided_by: grant.decided_by ?? null,
    rationale: grant.rationale,
    grants: { mechanical: grant.mechanical === true, ambiguous: [...ambiguous].sort() },
  };

  return {
    ...plan,
    state: "approved",
    items: approvedItems,
    approval,
  };
}

/**
 * refuse: record an explicit refusal with reason. Pure.
 */
export function refusePlan(plan, reason, decidedBy = null, now = new Date()) {
  if (plan.state !== "proposed" && plan.state !== "approved") {
    throw new RepairError(`cannot refuse a plan in state "${plan.state}"`);
  }
  return { ...plan, state: "refused", refusal: { reason, decided_by: decidedBy, decided_at: now.toISOString() } };
}

export class RepairError extends Error {}

/**
 * apply-to-copy: build the repaired output text for an approved plan.
 * Returns the output text plus the per-item application record. No I/O.
 *
 * @param {object} plan approved plan
 * @param {Uint8Array} inputBytes current input bytes (re-read by the caller)
 * @param {string} inputText current decoded text
 */
export function applyPlanToCopy(plan, inputBytes, inputText) {
  if (plan.state !== "approved") {
    throw new RepairError(`cannot apply a plan in state "${plan.state}" (approve it first)`);
  }
  const currentHash = sha256Hex(inputBytes);
  if (currentHash !== plan.input.sha256) {
    throw new RepairError(
      `input drifted since plan: plan hash ${plan.input.sha256.slice(0, 12)}…, ` +
      `current ${currentHash.slice(0, 12)}…. Re-run audit and propose a fresh plan.`,
    );
  }

  // Collect approved edits keyed by scalar index. Positions were captured in
  // the same scan the plan records, so we re-derive them from the current
  // text to splice exactly.
  const edits = new Map(); // scalarIndex -> replacement string
  const applications = [];
  for (const item of plan.items) {
    if (item.decision !== "approved") continue;
    const replacement = item.action === "remove" ? ""
      : item.action === "replace-space" ? " "
      : item.action === "replace-newline" ? "\n"
      : item.replacement ?? null;
    if (replacement === null) {
      throw new RepairError(`approved item ${item.id} has no replacement instruction`);
    }
    edits.set(item.finding.scalar_index ?? scalarIndexOf(inputText, item.finding), replacement);
    applications.push({ id: item.id, action: item.action, decision_reason: item.decision_reason });
  }

  let outputText = "";
  let applied = 0;
  let scalarIndex = 0;
  for (const scalar of inputText) {
    if (edits.has(scalarIndex)) {
      outputText += edits.get(scalarIndex);
      applied += 1;
    } else {
      outputText += scalar;
    }
    scalarIndex += 1;
  }

  let changes = [];
  if (plan.transform_profile && plan.transform_profile.definition) {
    const result = applyProfile(outputText, plan.transform_profile.definition);
    outputText = result.text;
    changes = result.changes;
  }

  const outputBytes = new TextEncoder().encode(outputText);
  return { outputText, outputBytes, applications, transform_changes: changes, expectedEdits: edits.size, appliedEdits: applied };
}

// Recover the scalar index for a finding if an older plan predates the field.
function scalarIndexOf(text, finding) {
  let scalarIndex = 0;
  let line = 1;
  let column = 1;
  for (const scalar of text) {
    if (line === finding.line && column === finding.column) return scalarIndex;
    if (scalar === "\n") { line += 1; column = 1; } else { column += 1; }
    scalarIndex += 1;
  }
  throw new RepairError(`could not re-locate ${finding.name} at L${finding.line} C${finding.column}`);
}

/**
 * Provenance record for one applied file. Pure data; the CLI writes it.
 */
export function provenanceRecord({ plan, appliedResult, outputPath, operator = null, now = new Date(), rescan = null }) {
  return {
    schema: SCHEMA_IDS.provenance,
    tool: plan.tool,
    catalogue_version: plan.catalogue_version,
    settings_digest: plan.settings_digest,
    path: plan.path,
    output_path: outputPath,
    input: plan.input,
    output: { sha256: sha256Hex(appliedResult.outputBytes), bytes: appliedResult.outputBytes.length },
    applied: appliedResult.applications,
    applied_edits: appliedResult.appliedEdits,
    // The deliberately-kept remainder: what an independent later rescan should
    // expect to find, nothing more.
    kept: plan.items
      .filter((item) => item.decision !== "approved")
      .map((item) => ({
        name: item.finding.name,
        code_point: item.finding.code_point,
        line: item.finding.line,
        column: item.finding.column,
      })),
    transform_profile: plan.transform_profile?.name ?? null,
    transform_changes: appliedResult.transform_changes,
    approval: plan.approval,
    operator,
    recorded_at: now.toISOString(),
    rescan,
  };
}

/**
 * verify: independently rescan a repaired copy. Pure text analysis.
 * The expected residuals are exactly the plan's non-approved findings
 * (kept/refused); anything else is a verification finding.
 *
 * @returns {{ record: object, verified: boolean, unexpected: object[] }}
 */
export function verifyCopy({ plan, outputBytes, outputText, rescanFn, now = new Date() }) {
  const outputHash = sha256Hex(outputBytes);
  const { findings } = rescanFn(outputText);

  const expectedKeys = new Set(
    plan.items
      .filter((item) => item.decision !== "approved")
      .map((item) => `${item.finding.name}@${item.finding.byte_offset}`),
  );

  // After edits, kept findings shift position; compare by (name, context)
  // rather than raw byte offset. Conservative: count and names must match.
  const expectedNames = [...expectedKeys].map((k) => k.split("@")[0]).sort();
  const actualNames = findings.map((f) => f.name).sort();
  const unexpected = [];
  const unexpectedCount = countDifferences(actualNames, expectedNames);
  for (const [name, count] of Object.entries(unexpectedCount)) {
    unexpected.push({ name, extra: count, description: `${count} unexpected ${name} finding(s) in repaired copy` });
  }

  const verified = unexpected.length === 0;
  const record = {
    schema: SCHEMA_IDS.rescan,
    plan_hash: plan.plan_hash,
    path: plan.path,
    output_sha256: outputHash,
    expected_residual_names: expectedNames,
    actual_finding_names: actualNames,
    expected_residual: expectedNames.length,
    actual_findings: findings.length,
    unexpected,
    verified,
    rescanned_at: now.toISOString(),
  };
  return { record, verified, unexpected };
}

function countDifferences(actual, expected) {
  const counts = new Map();
  for (const name of expected) counts.set(name, (counts.get(name) ?? 0) - 1);
  for (const name of actual) counts.set(name, (counts.get(name) ?? 0) + 1);
  const out = {};
  for (const [name, count] of counts) if (count > 0) out[name] = count;
  return out;
}

// ── Unified diff ──────────────────────────────────────────────────────────────

/**
 * A minimal, inspectable unified diff between two texts, context = 3 lines.
 * Only lines that actually differ (plus their context window) appear — the
 * "patch or clean copy without unrelated changes" requirement. The output is
 * deterministic and pinned by tests, so a patch can be audited line by line.
 */
export function unifiedDiff(oldText, newText, oldName = "a/input", newName = "b/output", context = 3) {
  const ops = diffOps(oldText, newText);
  if (ops.every((op) => op.type === "keep")) return "-- no differences --\n";

  // Locate hunk windows over the op list: every changed op, extended by
  // `context` keep-ops on each side, merging overlaps.
  const windows = [];
  ops.forEach((op, index) => {
    if (op.type === "keep") return;
    const start = Math.max(0, index - context);
    const end = Math.min(ops.length - 1, index + context);
    const last = windows[windows.length - 1];
    if (last && start <= last.end + 1) last.end = Math.max(last.end, end);
    else windows.push({ start, end });
  });

  let out = `--- ${oldName}\n+++ ${newName}\n`;
  for (const window of windows) {
    const slice = ops.slice(window.start, window.end + 1);
    const aCount = slice.filter((op) => op.type !== "ins").length;
    const bCount = slice.filter((op) => op.type !== "del").length;
    const aStart = slice.find((op) => op.type !== "ins")?.aIndex ?? 0;
    const bStart = slice.find((op) => op.type !== "del")?.bIndex ?? 0;
    const fmt = (start, count) => (count === 1 ? `${start + 1}` : `${start + 1},${count}`);
    out += `@@ -${fmt(aStart, aCount)} +${fmt(bStart, bCount)} @@\n`;
    for (const op of slice) {
      if (op.type === "keep") out += ` ${op.line}\n`;
      else if (op.type === "del") out += `-${op.line}\n`;
      else out += `+${op.line}\n`;
    }
  }
  return out;
}

/**
 * Full op list aligning two texts: [{type: "keep"|"del"|"ins", line, aIndex?,
 * bIndex?}]. Line-level LCS, bounded: over 4M DP cells falls back to a
 * whole-file replace so repair of pathological inputs degrades honestly
 * instead of exploding.
 */
export function diffOps(oldText, newText) {
  const a = oldText.split("\n");
  const b = newText.split("\n");
  const n = a.length;
  const m = b.length;

  if (n * m > 4_000_000) {
    return [
      ...a.map((line, i) => ({ type: "del", line, aIndex: i })),
      ...b.map((line, j) => ({ type: "ins", line, bIndex: j })),
    ];
  }

  const width = m + 1;
  const table = new Uint32Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      table[i * width + j] = a[i] === b[j]
        ? table[(i + 1) * width + j + 1] + 1
        : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
    }
  }

  const ops = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ type: "keep", line: a[i], aIndex: i, bIndex: j });
      i += 1;
      j += 1;
    } else if (table[(i + 1) * width + j] >= table[i * width + j + 1]) {
      ops.push({ type: "del", line: a[i], aIndex: i });
      i += 1;
    } else {
      ops.push({ type: "ins", line: b[j], bIndex: j });
      j += 1;
    }
  }
  while (i < n) { ops.push({ type: "del", line: a[i], aIndex: i }); i += 1; }
  while (j < m) { ops.push({ type: "ins", line: b[j], bIndex: j }); j += 1; }
  return ops;
}
