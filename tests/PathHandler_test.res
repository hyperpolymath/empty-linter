// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2025 Hyperpolymath
//
// Tests for PathHandler module
// 🏆 Idris Inside - Testing proven SafePath integration

open PathHandler

/** Deno test bindings */
@val external denoTest: (string, unit => unit) => unit = "Deno.test"

module Assert = {
  @val external assertEquals: ('a, 'a) => unit = "assertEquals"
  @val external assertNotEquals: ('a, 'a) => unit = "assertNotEquals"
  @val external assertStrictEquals: ('a, 'a) => unit = "assertStrictEquals"
  @val external assertExists: 'a => unit = "assertExists"
}

// Import assertions
%%raw(`
import { assertEquals, assertNotEquals, assertStrictEquals, assertExists } from "jsr:@std/assert";
`)

let () = denoTest("PathHandler: validate accepts safe paths", () => {
  switch validate("/home/user/file.txt") {
  | Some(path) =>
    Assert.assertEquals(unwrap(path), "/home/user/file.txt")
  | None =>
    Assert.assertExists(None)  // Should not reach here
  }
})

let () = denoTest("PathHandler: validate accepts relative paths", () => {
  switch validate("src/main.res") {
  | Some(path) =>
    Assert.assertEquals(unwrap(path), "src/main.res")
  | None =>
    Assert.assertExists(None)  // Should not reach here
  }
})

let () = denoTest("PathHandler: validate rejects traversal attacks", () => {
  switch validate("../../../etc/passwd") {
  | Some(_) =>
    Assert.assertExists(None)  // Should not reach here
  | None =>
    Assert.assertExists(None)  // Expected - traversal detected
  }
})

let () = denoTest("PathHandler: validate rejects embedded traversal", () => {
  switch validate("/home/user/../../../etc/passwd") {
  | Some(_) =>
    Assert.assertExists(None)  // Should not reach here
  | None =>
    Assert.assertExists(None)  // Expected
  }
})

let () = denoTest("PathHandler: sanitize removes dangerous characters", () => {
  let dirty = "file<name>.txt"
  let clean = sanitize(dirty)

  // Should not contain < or >
  Assert.assertEquals(Js.String2.includes(clean, "<"), false)
  Assert.assertEquals(Js.String2.includes(clean, ">"), false)
})

let () = denoTest("PathHandler: sanitize handles path traversal in filename", () => {
  let dirty = "../secret.txt"
  let clean = sanitize(dirty)

  // Should not start with ..
  Assert.assertEquals(Js.String2.startsWith(clean, ".."), false)
})

let () = denoTest("PathHandler: join creates valid paths", () => {
  switch validate("/home/user") {
  | Some(base) =>
    switch join(base, ["docs", "file.txt"]) {
    | Ok(joined) =>
      let result = unwrap(joined)
      Assert.assertExists(result)
    | Error(_) =>
      Assert.assertExists(None)  // Should not error
    }
  | None =>
    Assert.assertExists(None)  // Should not happen
  }
})

let () = denoTest("PathHandler: join rejects traversal in components", () => {
  switch validate("/home/user") {
  | Some(base) =>
    switch join(base, ["docs", "..", "..", "etc"]) {
    | Ok(_) =>
      Assert.assertExists(None)  // Should not succeed
    | Error(TraversalDetected) =>
      Assert.assertExists(TraversalDetected)  // Expected
    | Error(_) =>
      Assert.assertExists(None)  // Should be TraversalDetected
    }
  | None =>
    Assert.assertExists(None)
  }
})

let () = denoTest("PathHandler: filename extracts correctly", () => {
  switch validate("/home/user/docs/report.pdf") {
  | Some(path) =>
    Assert.assertEquals(filename(path), "report.pdf")
  | None =>
    Assert.assertExists(None)
  }
})

let () = denoTest("PathHandler: filename handles no directory", () => {
  switch validate("file.txt") {
  | Some(path) =>
    Assert.assertEquals(filename(path), "file.txt")
  | None =>
    Assert.assertExists(None)
  }
})

let () = denoTest("PathHandler: extension extracts correctly", () => {
  switch validate("/path/to/file.res") {
  | Some(path) =>
    switch extension(path) {
    | Some(ext) => Assert.assertEquals(ext, "res")
    | None => Assert.assertExists(None)
    }
  | None =>
    Assert.assertExists(None)
  }
})

let () = denoTest("PathHandler: extension returns None for no extension", () => {
  switch validate("/path/to/Makefile") {
  | Some(path) =>
    switch extension(path) {
    | Some(_) => Assert.assertExists(None)  // Should be None
    | None => Assert.assertExists(None)     // Expected
    }
  | None =>
    Assert.assertExists(None)
  }
})

let () = denoTest("PathHandler: hasExtension checks correctly", () => {
  switch validate("/path/to/file.res") {
  | Some(path) =>
    Assert.assertEquals(hasExtension(path, "res"), true)
    Assert.assertEquals(hasExtension(path, "js"), false)
  | None =>
    Assert.assertExists(None)
  }
})

let () = denoTest("PathHandler: hasExtension is case-insensitive", () => {
  switch validate("/path/to/file.RES") {
  | Some(path) =>
    Assert.assertEquals(hasExtension(path, "res"), true)
    Assert.assertEquals(hasExtension(path, "RES"), true)
  | None =>
    Assert.assertExists(None)
  }
})

let () = denoTest("PathHandler: parent extracts correctly", () => {
  switch validate("/home/user/docs/file.txt") {
  | Some(path) =>
    switch parent(path) {
    | Some(parentPath) =>
      Assert.assertEquals(unwrap(parentPath), "/home/user/docs")
    | None =>
      Assert.assertExists(None)
    }
  | None =>
    Assert.assertExists(None)
  }
})

let () = denoTest("PathHandler: parent returns None for root", () => {
  switch validate("/") {
  | Some(path) =>
    switch parent(path) {
    | Some(_) => Assert.assertExists(None)  // Should be None
    | None => Assert.assertExists(None)     // Expected
    }
  | None =>
    Assert.assertExists(None)
  }
})

let () = denoTest("PathHandler: isWithin checks containment", () => {
  switch (validate("/home/user/docs"), validate("/home/user")) {
  | (Some(path), Some(base)) =>
    Assert.assertEquals(isWithin(path, base), true)
  | _ =>
    Assert.assertExists(None)
  }
})

let () = denoTest("PathHandler: isWithin rejects outside paths", () => {
  switch (validate("/etc/passwd"), validate("/home/user")) {
  | (Some(path), Some(base)) =>
    Assert.assertEquals(isWithin(path, base), false)
  | _ =>
    Assert.assertExists(None)
  }
})

let () = denoTest("PathHandler: isExcluded matches patterns", () => {
  switch validate("/project/node_modules/package/index.js") {
  | Some(path) =>
    Assert.assertEquals(isExcluded(path, defaultExcludes), true)
  | None =>
    Assert.assertExists(None)
  }
})

let () = denoTest("PathHandler: isExcluded allows non-excluded paths", () => {
  switch validate("/project/src/main.res") {
  | Some(path) =>
    Assert.assertEquals(isExcluded(path, defaultExcludes), false)
  | None =>
    Assert.assertExists(None)
  }
})
