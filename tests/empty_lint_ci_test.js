// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Jonathan D.A. Jewell

import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const command = new URL("../scripts/empty-lint-ci.js", import.meta.url).pathname;

async function run(args) {
  const child = Bun.spawn([process.execPath, "run", command, ...args], {
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

async function withTempDirectory(operation) {
  const directory = await mkdtemp(join(tmpdir(), "empty-linter-"));
  try {
    await operation(directory);
  } finally {
    await rm(directory, { recursive: true });
  }
}

test("CI scanner passes clean input", async () => {
  await withTempDirectory(async (directory) => {
    const path = join(directory, "clean.txt");
    await writeFile(path, "ordinary text\n", "utf8");
    const result = await run([path]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("0 finding(s)");
  });
});

test("CI scanner fails planted critical input", async () => {
  await withTempDirectory(async (directory) => {
    const path = join(directory, "unsafe.txt");
    await writeFile(path, `before${String.fromCodePoint(0)}after`, "utf8");
    const result = await run([path]);
    expect(result.code).toBe(1);
    expect(result.stdout).toContain("NULL");
  });
});

test("CI scanner fails a planted non-NUL C0 control", async () => {
  await withTempDirectory(async (directory) => {
    const path = join(directory, "unsafe-control.txt");
    await writeFile(path, `before${String.fromCodePoint(7)}after`, "utf8");
    const result = await run([path]);
    expect(result.code).toBe(1);
    expect(result.stdout).toContain("C0_CONTROL");
  });
});

test("CI scanner reports advisory input without failing the default gate", async () => {
  await withTempDirectory(async (directory) => {
    const path = join(directory, "advisory.txt");
    await writeFile(path, `before${String.fromCodePoint(0x200d)}after`, "utf8");
    const result = await run([path]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("ZWJ");
  });
});

test("CI scanner distinguishes an enumeration failure", async () => {
  const result = await run(["definitely-does-not-exist.txt"]);
  expect(result.code).toBe(2);
  expect(result.stderr).toContain("could not enumerate input");
});
