// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Jonathan D.A. Jewell
//
// CLI contract tests: exit codes, formats, settings precedence, and distinct
// failure modes — all through the real subprocess, like the CI shim tests.

import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile, mkdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CLI = new URL("../src/cli/Main.bun.js", import.meta.url).pathname;
const NBSP = String.fromCodePoint(0x00a0);

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

async function withDir(operation) {
  const dir = await mkdtemp(join(tmpdir(), "empty-cli-"));
  try {
    await operation(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("CLI: audit exit codes 0/1/2 mean clean/findings/error", async () => {
  await withDir(async (dir) => {
    await writeFile(join(dir, "clean.txt"), "ordinary text\n");
    await writeFile(join(dir, "nul.txt"), `bad${String.fromCodePoint(0)}text`);
    await writeFile(join(dir, "malformed.txt"), Uint8Array.of(0xc3, 0x28));

    expect((await run(["audit", "--no-config", join(dir, "clean.txt")], dir)).code).toBe(0);
    const dirty = await run(["audit", "--no-config", join(dir, "nul.txt")], dir);
    expect(dirty.code).toBe(1);
    expect(dirty.stdout).toContain("NULL");
    const broken = await run(["audit", "--no-config", join(dir, "malformed.txt")], dir);
    expect(broken.code).toBe(2);
    expect(broken.stderr).toContain("malformed UTF-8");
    expect(broken.stderr).toContain("fail distinctly");
  });
});

test("CLI: threshold flag controls blocking, findings still reported", async () => {
  await withDir(async (dir) => {
    await writeFile(join(dir, "nbsp.txt"), `a${NBSP}b`);
    const critical = await run(["audit", "--no-config", "--threshold", "critical", join(dir, "nbsp.txt")], dir);
    expect(critical.code).toBe(0); // NBSP is error-severity: reported, not blocking
    expect(critical.stdout).toContain("NBSP");
    const error = await run(["audit", "--no-config", "--threshold", "error", join(dir, "nbsp.txt")], dir);
    expect(error.code).toBe(1);
  });
});

test("CLI: settings file drives the threshold (settings are active)", async () => {
  await withDir(async (dir) => {
    await writeFile(join(dir, "nbsp.txt"), `a${NBSP}b`);
    await writeFile(join(dir, "config.ncl"), "{ linter = { min_severity = 'Error } }\n");
    // config.ncl in CWD is picked up automatically
    const result = await run(["audit", join(dir, "nbsp.txt")], dir);
    expect(result.code).toBe(1); // 'Error from settings blocks NBSP
    expect(result.stdout).toContain("threshold error");
    const noCfg = await run(["audit", "--no-config", join(dir, "nbsp.txt")], dir);
    expect(noCfg.code).toBe(0);
  });
});

test("CLI: invalid settings exit 2 distinctly with every problem listed", async () => {
  await withDir(async (dir) => {
    await writeFile(join(dir, "config.ncl"), "{ linter = { min_severity = 'Bogus, auto_fix = \"yes\" } }\n");
    const result = await run(["audit", join(dir, "a.txt")], dir);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("min_severity");
    expect(result.stderr).toContain("auto_fix");
  });
});

test("CLI: --format json is schema-keyed and stdout-clean", async () => {
  await withDir(async (dir) => {
    await writeFile(join(dir, "x.txt"), `a${NBSP}b`);
    const result = await run(["audit", "--no-config", "--format", "json", join(dir, "x.txt")], dir);
    const records = JSON.parse(result.stdout); // parses: no prose on stdout
    expect(records[0].schema).toContain("diagnostic.v1.json");
    expect(records[0].findings[0].name).toBe("NBSP");
    expect(result.stderr).toContain("finding(s)"); // chatter on stderr
  });
});

test("CLI: --format hex emits the dotmatrix-style listing", async () => {
  await withDir(async (dir) => {
    await writeFile(join(dir, "x.txt"), `a${NBSP}b`);
    const result = await run(["audit", "--no-config", "--format", "hex", join(dir, "x.txt")], dir);
    expect(result.stdout).toContain("0x00A0 [NBSP]");
  });
});

test("CLI: show renders invisibles visibly and refuses malformed input", async () => {
  await withDir(async (dir) => {
    await writeFile(join(dir, "x.txt"), `a${NBSP}b\n`);
    const shown = await run(["show", join(dir, "x.txt")], dir);
    expect(shown.code).toBe(0);
    expect(shown.stdout).toContain("⟦U+00A0 NBSP⟧");
    await writeFile(join(dir, "bad.txt"), Uint8Array.of(0xff, 0xfe, 0xfd));
    const refused = await run(["show", join(dir, "bad.txt")], dir);
    expect(refused.code).toBe(2);
    expect(refused.stderr).toContain("malformed UTF-8");
  });
});

test("CLI: approve with no grant is a distinct error", async () => {
  await withDir(async (dir) => {
    await writeFile(join(dir, "x.txt"), `a${NBSP}b`);
    await run(["plan", "--no-config", join(dir, "x.txt"), "--out", "p.json"], dir);
    const result = await run(["approve", "p.json"], dir);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("--mechanical");
    expect(result.stderr).toContain("--allow");
  });
});

test("CLI: apply refuses in-place via same-directory output", async () => {
  await withDir(async (dir) => {
    await writeFile(join(dir, "x.txt"), `a${NBSP}b`);
    await run(["plan", "--no-config", join(dir, "x.txt"), "--out", "p.json"], dir);
    await run(["approve", "p.json", "--mechanical", "--rationale", "t"], dir);
    const result = await run(["apply", "p.json", "--out", dir], dir);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("refusing");
    expect((await readFile(join(dir, "x.txt"), "utf-8"))).toContain(NBSP); // input untouched
  });
});

test("CLI: workspace constraints are checked from settings", async () => {
  await withDir(async (dir) => {
    await writeFile(join(dir, "config.ncl"), "{ workspaces = { tweet = { constraints = { max_chars = 5 }, transform = \"default\" } } }\n");
    await writeFile(join(dir, "post.txt"), "this is longer than five characters");
    const result = await run(["audit", "--workspace", "tweet", join(dir, "post.txt")], dir);
    expect(result.stdout).toContain("CONSTRAINT_CHARS");
    expect(result.stdout).toContain("exceeds maximum 5");
  });
});

test("CLI: a nonexistent path fails distinctly as an enumeration error", async () => {
  // Note: bare words default to the audit command; a bad path is an input
  // error (exit 2), never a phantom "clean" result.
  const result = await run(["frobnicate"], "/tmp");
  expect(result.code).toBe(2);
  expect(result.stderr).toContain("could not enumerate input");
  const bogus = await run(["audit", "definitely-not-here.txt"], "/tmp");
  expect(bogus.code).toBe(2);
  expect(bogus.stderr).toContain("could not enumerate input");
});
