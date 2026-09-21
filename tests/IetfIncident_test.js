// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Jonathan D.A. Jewell
//
// IetfIncident_test.js — the originating acceptance fixture of issue #74.
//
// Reproduces the incident that inspired Empty-linter (a hidden character
// planted in an IETF Datatracker submission) and drives the whole product
// surface through the real CLI as a subprocess, asserting every fixture
// requirement:
//
//   [x] exact code point and UTF-8 bytes
//   [x] file, line, Unicode-scalar column, and byte offset
//   [x] visible escaped context and character/category description
//   [x] whether removal is mechanically safe, semantic, or ambiguous
//   [x] an inspectable patch without unrelated changes
//   [x] input/output hashes, provenance, and a successful rescan record
//
// …and the non-negotiable truth conditions:
//   audit never mutates input · semantic characters are never auto-repaired ·
//   the clean result is only trusted because the planted input was detected.

import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile, copyFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { FIXTURE_TEXT } from "./fixtures/ietf-incident/build-fixture.js";

const CLI = new URL("../src/cli/Main.bun.js", import.meta.url).pathname;
const FIXTURE = new URL("./fixtures/ietf-incident/draft-rfc-style.txt", import.meta.url).pathname;

// Expected positions of the three plantings (documented in FIXTURE.adoc).
const EXPECT_NBSP = { line: 9, column: 56, byte_offset: 372, utf8_hex: "C2 A0" };
const EXPECT_ZWJ = { line: 10, column: 56, byte_offset: 440, utf8_hex: "E2 80 8D" };
const EXPECT_ZALGO = { line: 11, column: 33, byte_offset: 488 };

const NBSP_CHAR = String.fromCodePoint(0x00a0);
const ZWJ_CHAR = String.fromCodePoint(0x200d);
const ZALGO_MARKS = [0x0334, 0x0335, 0x0336, 0x0337, 0x0338].map((cp) => String.fromCodePoint(cp));

function sha256(data) {
  return createHash("sha256").update(data).digest("hex");
}

async function run(args, cwd) {
  const child = Bun.spawn([process.execPath, "run", CLI, ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...Bun.env, GITHUB_ACTIONS: "false" },
  });
  const [code, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  return { code, stdout, stderr };
}

async function withWorkdir(operation) {
  const dir = await mkdtemp(join(tmpdir(), "ietf-incident-"));
  try {
    await operation(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// ── 0. The checked-in fixture cannot drift ────────────────────────────────────

test("fixture: checked-in draft equals the documented generator output", async () => {
  const onDisk = await readFile(FIXTURE, "utf-8");
  expect(onDisk).toBe(FIXTURE_TEXT);
});

// ── 1. The acceptance fixture, end to end ─────────────────────────────────────

test("IETF incident fixture: full audit → plan → approve → apply → verify", async () => {
  await withWorkdir(async (dir) => {
    const draft = join(dir, "draft-rfc-style.txt");
    await copyFile(FIXTURE, draft);
    const inputBefore = sha256(await readFile(draft));

    // ── AUDIT (reads only) ────────────────────────────────────────────────
    const audit = await run(["audit", "--format", "json", "--no-config", draft], dir);
    // NBSP and the zalgo run are ERROR severity; the default built-in
    // threshold is CRITICAL, so they are reported without blocking.
    expect(audit.code).toBe(0);
    expect(audit.stderr).toContain("3 finding(s)");
    const records = JSON.parse(audit.stdout);
    expect(records.length).toBe(1);
    const record = records[0];
    expect(record.schema).toBe("https://hyperpolymath.dev/schemas/empty-linter/diagnostic.v1.json");
    expect(record.stats.finding_count).toBe(3);
    expect(record.stats.scanner_errors).toEqual([]);

    const byName = Object.fromEntries(record.findings.map((f) => [f.name, f]));

    // exact code point and UTF-8 bytes; file, line, Unicode-scalar column,
    // byte offset; escaped context; category description; safety class.
    const nbsp = byName.NBSP;
    expect(nbsp.code_point).toBe(0xA0);
    expect(nbsp.utf8_hex).toBe(EXPECT_NBSP.utf8_hex);
    expect(record.path).toContain("draft-rfc-style.txt");
    expect(nbsp.line).toBe(EXPECT_NBSP.line);
    expect(nbsp.column).toBe(EXPECT_NBSP.column); // Unicode-scalar column, NOT UTF-16
    expect(nbsp.byte_offset).toBe(EXPECT_NBSP.byte_offset);
    expect(nbsp.context_escaped).toContain("network⟦U+00A0 NBSP⟧layer");
    expect(nbsp.unicode_name).toBe("NO-BREAK SPACE");
    expect(nbsp.category).toBe("Zs");
    expect(nbsp.description.length).toBeGreaterThan(20);
    expect(nbsp.safety).toBe("mechanical"); // …removal is mechanically safe

    const zwj = byName.ZWJ;
    expect(zwj.code_point).toBe(0x200D);
    expect(zwj.utf8_hex).toBe(EXPECT_ZWJ.utf8_hex);
    expect(zwj.line).toBe(EXPECT_ZWJ.line);
    expect(zwj.column).toBe(EXPECT_ZWJ.column);
    expect(zwj.byte_offset).toBe(EXPECT_ZWJ.byte_offset);
    expect(zwj.safety).toBe("semantic"); // …never removed for being invisible

    const zalgo = byName.ZALGO_RUN;
    expect(zalgo.line).toBe(EXPECT_ZALGO.line);
    expect(zalgo.column).toBe(EXPECT_ZALGO.column);
    expect(zalgo.byte_offset).toBe(EXPECT_ZALGO.byte_offset);
    expect(zalgo.code_point).toBe(0x0334);
    expect(zalgo.safety).toBe("ambiguous");
    expect(zalgo.description).toContain("combining marks");

    // audit never mutates input
    const inputAfterAudit = sha256(await readFile(draft));
    expect(inputAfterAudit).toBe(inputBefore);

    // ── PROPOSE ───────────────────────────────────────────────────────────
    const planResult = await run(["plan", "--no-config", draft, "--out", "plan.json"], dir);
    expect(planResult.code).toBe(0);
    expect(sha256(await readFile(draft))).toBe(inputBefore); // propose mutates nothing
    const proposed = JSON.parse(await readFile(join(dir, "plan.json"), "utf-8"));
    expect(proposed.state).toBe("proposed");
    expect(proposed.input.sha256).toBe(inputBefore); // input hash recorded
    const itemsByName = Object.fromEntries(proposed.items.map((i) => [i.finding.name, i]));
    expect(itemsByName.NBSP.action).toBe("replace-space");
    expect(itemsByName.NBSP.grant_class).toBe("mechanical");
    expect(itemsByName.ZWJ.action).toBe("keep");
    expect(itemsByName.ZWJ.grant_class).toBe("semantic");
    expect(itemsByName.ZALGO_RUN.action).toBe("keep"); // review required

    // ── APPROVE (mechanical only) ─────────────────────────────────────────
    const approve = await run(
      ["approve", "plan.json", "--mechanical", "--rationale", "NBSP→space is a mechanical copy-edit for Datatracker resubmission", "--by", "fixture-test"],
      dir,
    );
    expect(approve.code).toBe(0);
    const approved = JSON.parse(await readFile(join(dir, "plan.json"), "utf-8"));
    expect(approved.state).toBe("approved");
    expect(approved.items.find((i) => i.finding.name === "NBSP").decision).toBe("approved");
    expect(approved.items.find((i) => i.finding.name === "ZWJ").decision).toBe("refused");
    expect(approved.items.find((i) => i.finding.name === "ZALGO_RUN").decision).toBe("kept");

    // ── APPLY-TO-COPY (input immutable, copy + patch + provenance) ────────
    const apply = await run(["apply", "plan.json", "--out", "repaired"], dir);
    expect(apply.code).toBe(0);
    expect(sha256(await readFile(draft))).toBe(inputBefore); // input untouched

    const copy = await readFile(join(dir, "repaired", "draft-rfc-style.txt"));
    const copyText = copy.toString("utf-8");
    // Mechanical fix landed; semantic/ambiguous content preserved verbatim.
    expect(copyText).not.toContain(NBSP_CHAR);
    expect(copyText).toContain("network layer"); // NBSP became U+0020
    expect(copyText).toContain(`data${ZWJ_CHAR}formats`); // ZWJ kept
    for (const mark of ZALGO_MARKS) expect(copyText).toContain(mark); // zalgo kept

    // inspectable patch without unrelated changes
    const patch = await readFile(join(dir, "repaired", "draft-rfc-style.txt.patch"), "utf-8");
    const touched = patch.split("\n").filter((l) => /^[+-]/.test(l) && !/^(---|\+\+\+)/.test(l));
    expect(touched.length).toBe(2); // exactly one line out, one line in
    expect(touched[0]).toBe(`-   This memo describes an incident in which the network${NBSP_CHAR}layer of a`);
    expect(touched[1]).toBe(`+   This memo describes an incident in which the network layer of a`);

    // provenance: input/output hashes + record completeness
    const provLines = (await readFile(join(dir, "repaired", "provenance.jsonl"), "utf-8")).trim().split("\n");
    expect(provLines.length).toBe(1);
    const prov = JSON.parse(provLines[0]);
    expect(prov.schema).toBe("https://hyperpolymath.dev/schemas/empty-linter/provenance.v1.json");
    expect(prov.input.sha256).toBe(inputBefore);
    expect(prov.output.sha256).toBe(sha256(copy));
    expect(prov.applied_edits).toBe(1);
    expect(prov.applied[0].action).toBe("replace-space");
    expect(prov.kept.map((k) => k.name).sort()).toEqual(["ZALGO_RUN", "ZWJ"]);
    expect(prov.rescan?.verified).toBe(true); // apply-time rescan succeeded

    // ── VERIFY (independent rescan record) ────────────────────────────────
    const verify = await run(["verify", join("repaired", "provenance.jsonl")], dir);
    expect(verify.code).toBe(0);
    expect(verify.stdout).toContain("VERIFIED");
    const reportDir = join(dir, "repaired", "provenance");
    const rescanFiles = await readdir(reportDir);
    expect(rescanFiles).toEqual(["rescan-001.json"]);
    const rescan = JSON.parse(await readFile(join(reportDir, rescanFiles[0]), "utf-8"));
    expect(rescan.schema).toBe("https://hyperpolymath.dev/schemas/empty-linter/rescan.v1.json");
    expect(rescan.verified).toBe(true);
    expect(rescan.expected_residual_names).toEqual(["ZALGO_RUN", "ZWJ"]);
    expect(rescan.actual_finding_names).toEqual(["ZALGO_RUN", "ZWJ"]);
    expect(rescan.unexpected).toEqual([]);
    expect(rescan.output_sha256).toBe(sha256(copy));

    // ── Rescan of the repaired copy = the clean sheet the author needed ───
    const finalAudit = await run(["audit", "--format", "json", "--no-config", join("repaired", "draft-rfc-style.txt")], dir);
    const finalRecord = JSON.parse(finalAudit.stdout)[0];
    expect(finalRecord.findings.map((f) => f.name).sort()).toEqual(["ZALGO_RUN", "ZWJ"]);
  });
});

test("IETF incident fixture: a clean draft passes and report is empty", async () => {
  await withWorkdir(async (dir) => {
    const clean = join(dir, "clean.txt");
    await writeFile(clean, "This draft has never seen a word processor.\n", "utf-8");
    const audit = await run(["audit", "--format", "json", "--no-config", clean], dir);
    expect(audit.code).toBe(0);
    const [record] = JSON.parse(audit.stdout);
    expect(record.stats.finding_count).toBe(0);
    expect(audit.stderr).toContain("0 finding(s)");
  });
});

test("IETF incident fixture: input drift between plan and apply is refused", async () => {
  await withWorkdir(async (dir) => {
    const draft = join(dir, "draft.txt");
    await copyFile(FIXTURE, draft);
    await run(["plan", "--no-config", draft, "--out", "plan.json"], dir);
    await run(["approve", "plan.json", "--mechanical", "--rationale", "drift test"], dir);
    await writeFile(draft, `${await readFile(draft, "utf-8")}touched after approval\n`, "utf-8");
    const apply = await run(["apply", "plan.json", "--out", "repaired"], dir);
    expect(apply.code).toBe(2);
    expect(apply.stderr).toContain("input drifted");
  });
});
