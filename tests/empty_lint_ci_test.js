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

const scanScenarios = [
  {
    name: "passes clean input",
    filename: "clean.txt",
    content: "ordinary text\n",
    code: 0,
    stream: "stdout",
    expected: "0 finding(s)",
  },
  {
    name: "fails planted critical input",
    filename: "unsafe.txt",
    content: `before${String.fromCodePoint(0)}after`,
    code: 1,
    stream: "stdout",
    expected: "NULL",
  },
  {
    name: "fails a planted non-NUL C0 control",
    filename: "unsafe-control.txt",
    content: `before${String.fromCodePoint(7)}after`,
    code: 1,
    stream: "stdout",
    expected: "C0_CONTROL",
  },
  {
    name: "reports advisory input without failing the default gate",
    filename: "advisory.txt",
    content: `before${String.fromCodePoint(0x200d)}after`,
    code: 0,
    stream: "stdout",
    expected: "ZWJ",
  },
  {
    name: "preserves and reports a leading BOM",
    filename: "bom.txt",
    content: "\uFEFFordinary text\n",
    code: 0,
    stream: "stdout",
    expected: "BOM",
  },
  {
    name: "rejects malformed UTF-8 instead of replacing bytes",
    filename: "malformed.txt",
    content: Uint8Array.of(0xc3, 0x28),
    code: 2,
    stream: "stderr",
    expected: "scan failed",
  },
];

for (const scenario of scanScenarios) {
  test(`CI scanner ${scenario.name}`, async () => {
    await withTempDirectory(async (directory) => {
      const path = join(directory, scenario.filename);
      await writeFile(path, scenario.content);
      const result = await run([path]);
      expect(result.code).toBe(scenario.code);
      expect(result[scenario.stream]).toContain(scenario.expected);
    });
  });
}

test("CI scanner distinguishes an enumeration failure", async () => {
  const result = await run(["definitely-does-not-exist.txt"]);
  expect(result.code).toBe(2);
  expect(result.stderr).toContain("could not enumerate input");
});
