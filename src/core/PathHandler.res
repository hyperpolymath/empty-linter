// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2025 Hyperpolymath
//
// PathHandler - Safe filesystem path operations
// 🏆 Idris Inside - Uses proven SafePath for traversal-proof paths

open Proven_SafePath

/** Path error types */
type pathError =
  | TraversalDetected
  | InvalidPath
  | PermissionDenied
  | NotFound

/** Validated path wrapper - proves path has been checked */
type validatedPath = ValidatedPath(string)

/** Unwrap a validated path */
let unwrap = (ValidatedPath(path)) => path

/** Validate and create a safe path
 *
 * 🏆 Idris Inside: Uses SafePath.isSafe for traversal detection
 * Returns None if path contains traversal attempts
 */
let validate = (path: string): option<validatedPath> => {
  if isSafe(path) {
    Some(ValidatedPath(path))
  } else {
    None
  }
}

/** Safely join base path with user-provided components
 *
 * 🏆 Idris Inside: Uses SafePath.safeJoin with traversal protection
 */
let join = (base: validatedPath, components: array<string>): result<validatedPath, pathError> => {
  let ValidatedPath(basePath) = base

  // Check each component for safety
  let hasUnsafe = components->Belt.Array.some(c => !isSafe(c))
  if hasUnsafe {
    Error(TraversalDetected)
  } else {
    switch safeJoin(basePath, components) {
    | Some(joined) => Ok(ValidatedPath(joined))
    | None => Error(TraversalDetected)
    }
  }
}

/** Sanitize a filename for safe storage
 *
 * 🏆 Idris Inside: Uses SafePath.sanitizeFilename
 */
let sanitize = (filename: string): string => {
  sanitizeFilename(filename)
}

/** Check if a path is within a base directory
 *
 * Prevents directory escape attacks
 */
let isWithin = (path: validatedPath, base: validatedPath): bool => {
  let ValidatedPath(pathStr) = path
  let ValidatedPath(baseStr) = base

  // Normalize both paths
  let normalizedPath = Js.String2.replaceByRe(pathStr, %re("/\\/+/g"), "/")
  let normalizedBase = Js.String2.replaceByRe(baseStr, %re("/\\/+/g"), "/")

  // Check if path starts with base
  Js.String2.startsWith(normalizedPath, normalizedBase)
}

/** Get the parent directory of a path */
let parent = (path: validatedPath): option<validatedPath> => {
  let ValidatedPath(pathStr) = path
  let lastSlash = Js.String2.lastIndexOf(pathStr, "/")

  if lastSlash <= 0 {
    None
  } else {
    let parentPath = Js.String2.slice(pathStr, ~from=0, ~to_=lastSlash)
    Some(ValidatedPath(parentPath))
  }
}

/** Get the filename from a path */
let filename = (path: validatedPath): string => {
  let ValidatedPath(pathStr) = path
  let lastSlash = Js.String2.lastIndexOf(pathStr, "/")

  if lastSlash < 0 {
    pathStr
  } else {
    Js.String2.sliceToEnd(pathStr, ~from=lastSlash + 1)
  }
}

/** Get the file extension */
let extension = (path: validatedPath): option<string> => {
  let name = filename(path)
  let lastDot = Js.String2.lastIndexOf(name, ".")

  if lastDot <= 0 {
    None
  } else {
    Some(Js.String2.sliceToEnd(name, ~from=lastDot + 1))
  }
}

/** Check if path has specific extension */
let hasExtension = (path: validatedPath, ext: string): bool => {
  switch extension(path) {
  | Some(e) => Js.String2.toLowerCase(e) == Js.String2.toLowerCase(ext)
  | None => false
  }
}

/** Exclude patterns for directory scanning */
type excludePattern = {
  pattern: string,
  isDir: bool,
}

/** Default exclude patterns for linting */
let defaultExcludes: array<excludePattern> = [
  { pattern: "node_modules", isDir: true },
  { pattern: ".git", isDir: true },
  { pattern: "lib", isDir: true },
  { pattern: "dist", isDir: true },
  { pattern: "build", isDir: true },
  { pattern: ".cache", isDir: true },
]

/** Check if a path matches any exclude pattern */
let isExcluded = (path: validatedPath, excludes: array<excludePattern>): bool => {
  let ValidatedPath(pathStr) = path
  excludes->Belt.Array.some(exc => {
    Js.String2.includes(pathStr, "/" ++ exc.pattern ++ "/") ||
    Js.String2.endsWith(pathStr, "/" ++ exc.pattern)
  })
}

/** Create validated path from trusted source (internal use only) */
let fromTrusted = (path: string): validatedPath => {
  ValidatedPath(path)
}

/** Convert result to option for simpler error handling */
let resultToOption = (result: result<'a, 'e>): option<'a> => {
  switch result {
  | Ok(v) => Some(v)
  | Error(_) => None
  }
}
