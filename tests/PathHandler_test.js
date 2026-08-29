// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Jonathan D.A. Jewell <j.d.a.jewell@open.ac.uk>
import { test } from "bun:test";
import {
  validate, unwrap_path, path_join, sanitize,
  is_within, get_parent, filename, has_extension,
  is_excluded, from_trusted,
  TraversalDetected,
} from "../src/core/PathHandler.bun.js";

function assertEquals(actual, expected) {
  if (!Object.is(actual, expected)) throw new Error(`expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

test("PathHandler: validate accepts relative paths", () => {
  const p = validate("src/main.affine");
  assertEquals(p.tag, "Some");
  assertEquals(unwrap_path(p.value), "src/main.affine");
});

test("PathHandler: validate rejects absolute paths", () => {
  assertEquals(validate("/etc/passwd").tag, "None");
});

test("PathHandler: validate rejects path traversal", () => {
  assertEquals(validate("../../etc/passwd").tag, "None");
});

test("PathHandler: validate rejects embedded traversal", () => {
  assertEquals(validate("src/../../../etc").tag, "None");
});

test("PathHandler: sanitize removes dangerous characters", () => {
  const clean = sanitize("file<name>.txt");
  assertEquals(clean.includes("<"), false);
  assertEquals(clean.includes(">"), false);
});

test("PathHandler: sanitize replaces slashes", () => {
  const clean = sanitize("path/to/file");
  assertEquals(clean.includes("/"), false);
});

test("PathHandler: path_join creates valid joined path", () => {
  const base = from_trusted("docs");
  const result = path_join(base, ["notes", "file.txt"]);
  assertEquals(result.tag, "Ok");
  assertEquals(unwrap_path(result.value), "docs/notes/file.txt");
});

test("PathHandler: path_join rejects traversal in components", () => {
  const base = from_trusted("home");
  const result = path_join(base, ["..", "..", "etc"]);
  assertEquals(result.tag, "Err");
  assertEquals(result.error.tag, "TraversalDetected");
});

test("PathHandler: filename extracts basename", () => {
  const p = from_trusted("docs/reports/file.pdf");
  assertEquals(filename(p), "file.pdf");
});

test("PathHandler: filename handles no directory", () => {
  assertEquals(filename(from_trusted("file.txt")), "file.txt");
});

test("PathHandler: has_extension checks extension", () => {
  const p = from_trusted("src/main.affine");
  assertEquals(has_extension(p, ".affine"), true);
  assertEquals(has_extension(p, ".js"), false);
});

test("PathHandler: get_parent extracts directory", () => {
  const p = from_trusted("home/user/docs/file.txt");
  const parent = get_parent(p);
  assertEquals(parent.tag, "Some");
  assertEquals(unwrap_path(parent.value), "home/user/docs");
});

test("PathHandler: get_parent returns None for no directory", () => {
  assertEquals(get_parent(from_trusted("file.txt")).tag, "None");
});

test("PathHandler: is_within checks path containment", () => {
  const p = from_trusted("home/user/docs");
  const base = from_trusted("home/user");
  assertEquals(is_within(p, base), true);
});

test("PathHandler: is_within rejects unrelated paths", () => {
  const p = from_trusted("etc/passwd");
  const base = from_trusted("home/user");
  assertEquals(is_within(p, base), false);
});

test("PathHandler: is_excluded matches excluded dirs", () => {
  const p = from_trusted("project/node_modules/pkg/index.js");
  assertEquals(is_excluded(p, ["node_modules", ".git"]), true);
});

test("PathHandler: is_excluded allows non-excluded paths", () => {
  const p = from_trusted("project/src/main.affine");
  assertEquals(is_excluded(p, ["node_modules", ".git"]), false);
});
