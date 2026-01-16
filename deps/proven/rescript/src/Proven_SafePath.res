// SPDX-License-Identifier: PMPL-1.0
// SPDX-FileCopyrightText: 2025 Hyperpolymath

/**
 * SafePath - Filesystem path operations that cannot crash.
 */

/** Check if a path contains directory traversal sequences */
let hasTraversal = (path: string): bool => {
  Js.String2.includes(path, "..") ||
  Js.String2.includes(path, "~") ||
  Js.String2.startsWith(path, "/") && Js.String2.includes(path, "..")
}

/** Check if a path is safe (no traversal attacks) */
let isSafe = (path: string): bool => {
  !hasTraversal(path)
}

/** Sanitize a filename by removing dangerous characters */
let sanitizeFilename = (filename: string): string => {
  filename
  ->Js.String2.replaceByRe(%re("/\\.\\./g"), "_")
  ->Js.String2.replaceByRe(%re("/[\\/\\\\]/g"), "_")
  ->Js.String2.replaceByRe(%re("/[\\x00-\\x1f]/g"), "")
  ->Js.String2.replaceByRe(%re("/[<>:\"\\|\\?\\*]/g"), "_")
}

/** Safely join path components, rejecting traversal attempts */
let safeJoin = (base: string, parts: array<string>): option<string> => {
  let hasUnsafe = parts->Belt.Array.some(part => hasTraversal(part))
  if hasUnsafe {
    None
  } else {
    let result = ref(base)
    parts->Belt.Array.forEach(part => {
      let sanitized = sanitizeFilename(part)
      let base = result.contents
      if Js.String2.endsWith(base, "/") {
        result := base ++ sanitized
      } else {
        result := base ++ "/" ++ sanitized
      }
    })
    Some(result.contents)
  }
}
