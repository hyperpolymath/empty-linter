// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Jonathan D.A. Jewell <j.d.a.jewell@open.ac.uk>
import { assertEquals } from "jsr:@std/assert";
import {
  validate, unwrap_path, path_join, sanitize,
  is_within, get_parent, filename, has_extension,
  is_excluded, from_trusted,
  TraversalDetected,
} from "../src/core/PathHandler.deno.js";

Deno.test("PathHandler: validate accepts relative paths", () => {
  const p = validate("src/main.affine");
  assertEquals(p.tag, "Some");
  assertEquals(unwrap_path(p.value), "src/main.affine");
});

Deno.test("PathHandler: validate rejects absolute paths", () => {
  assertEquals(validate("/etc/passwd").tag, "None");
});

Deno.test("PathHandler: validate rejects path traversal", () => {
  assertEquals(validate("../../etc/passwd").tag, "None");
});

Deno.test("PathHandler: validate rejects embedded traversal", () => {
  assertEquals(validate("src/../../../etc").tag, "None");
});

Deno.test("PathHandler: sanitize removes dangerous characters", () => {
  const clean = sanitize("file<name>.txt");
  assertEquals(clean.includes("<"), false);
  assertEquals(clean.includes(">"), false);
});

Deno.test("PathHandler: sanitize replaces slashes", () => {
  const clean = sanitize("path/to/file");
  assertEquals(clean.includes("/"), false);
});

Deno.test("PathHandler: path_join creates valid joined path", () => {
  const base = from_trusted("docs");
  const result = path_join(base, ["notes", "file.txt"]);
  assertEquals(result.tag, "Ok");
  assertEquals(unwrap_path(result.value), "docs/notes/file.txt");
});

Deno.test("PathHandler: path_join rejects traversal in components", () => {
  const base = from_trusted("home");
  const result = path_join(base, ["..", "..", "etc"]);
  assertEquals(result.tag, "Err");
  assertEquals(result.error.tag, "TraversalDetected");
});

Deno.test("PathHandler: filename extracts basename", () => {
  const p = from_trusted("docs/reports/file.pdf");
  assertEquals(filename(p), "file.pdf");
});

Deno.test("PathHandler: filename handles no directory", () => {
  assertEquals(filename(from_trusted("file.txt")), "file.txt");
});

Deno.test("PathHandler: has_extension checks extension", () => {
  const p = from_trusted("src/main.affine");
  assertEquals(has_extension(p, ".affine"), true);
  assertEquals(has_extension(p, ".js"), false);
});

Deno.test("PathHandler: get_parent extracts directory", () => {
  const p = from_trusted("home/user/docs/file.txt");
  const parent = get_parent(p);
  assertEquals(parent.tag, "Some");
  assertEquals(unwrap_path(parent.value), "home/user/docs");
});

Deno.test("PathHandler: get_parent returns None for no directory", () => {
  assertEquals(get_parent(from_trusted("file.txt")).tag, "None");
});

Deno.test("PathHandler: is_within checks path containment", () => {
  const p = from_trusted("home/user/docs");
  const base = from_trusted("home/user");
  assertEquals(is_within(p, base), true);
});

Deno.test("PathHandler: is_within rejects unrelated paths", () => {
  const p = from_trusted("etc/passwd");
  const base = from_trusted("home/user");
  assertEquals(is_within(p, base), false);
});

Deno.test("PathHandler: is_excluded matches excluded dirs", () => {
  const p = from_trusted("project/node_modules/pkg/index.js");
  assertEquals(is_excluded(p, ["node_modules", ".git"]), true);
});

Deno.test("PathHandler: is_excluded allows non-excluded paths", () => {
  const p = from_trusted("project/src/main.affine");
  assertEquals(is_excluded(p, ["node_modules", ".git"]), false);
});
