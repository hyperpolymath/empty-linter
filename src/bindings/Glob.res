// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2025 Hyperpolymath
//
// Glob pattern matching bindings for empty-linter
// Provides file discovery with pattern matching

open Deno

/** Glob options */
type globOptions = {
  root: string,
  exclude: array<string>,
  includeDirs: bool,
  followSymlinks: bool,
}

/** Default glob options */
let defaultOptions: globOptions = {
  root: ".",
  exclude: ["node_modules", ".git", "lib", "dist", "build"],
  includeDirs: false,
  followSymlinks: false,
}

/** Simple glob pattern matcher
 *
 * Supports:
 * - * matches any characters except /
 * - ** matches any characters including /
 * - ? matches single character
 */
let matchPattern = (pattern: string, path: string): bool => {
  // Convert glob to regex
  let regexStr = pattern
    ->Js.String2.replaceByRe(%re("/\\./g"), "\\.")
    ->Js.String2.replaceByRe(%re("/\\*\\*/g"), "<<<GLOBSTAR>>>")
    ->Js.String2.replaceByRe(%re("/\\*/g"), "[^/]*")
    ->Js.String2.replaceByRe(%re("/<<<GLOBSTAR>>>/g"), ".*")
    ->Js.String2.replaceByRe(%re("/\\?/g"), ".")

  let regex = Js.Re.fromStringWithFlags("^" ++ regexStr ++ "$", ~flags="")
  Js.Re.test_(regex, path)
}

/** Check if path matches any exclude pattern */
let isExcluded = (path: string, excludes: array<string>): bool => {
  excludes->Belt.Array.some(exc => {
    Js.String2.includes(path, "/" ++ exc ++ "/") ||
    Js.String2.endsWith(path, "/" ++ exc) ||
    Js.String2.startsWith(path, exc ++ "/")
  })
}

/** Walk directory recursively */
let rec walkDir = async (dir: string, options: globOptions): array<string> => {
  let results = ref([])

  try {
    let entries = Deno.readDir(dir)
    let items = await AsyncIter.toArray(entries)

    for i in 0 to Belt.Array.length(items) - 1 {
      let entry = Belt.Array.getUnsafe(items, i)
      let fullPath = Path.join([dir, entry.name])

      if !isExcluded(fullPath, options.exclude) {
        if entry.isDirectory {
          if options.includeDirs {
            results := Belt.Array.concat(results.contents, [fullPath])
          }
          let subResults = await walkDir(fullPath, options)
          results := Belt.Array.concat(results.contents, subResults)
        } else if entry.isFile {
          results := Belt.Array.concat(results.contents, [fullPath])
        }
      }
    }
  } catch {
  | _ => ()
  }

  results.contents
}

/** Glob files matching pattern */
let glob = async (pattern: string, options: globOptions): array<string> => {
  let allFiles = await walkDir(options.root, options)

  // Filter by pattern
  allFiles->Belt.Array.keep(path => {
    // Make path relative to root for matching
    let relativePath = if Js.String2.startsWith(path, options.root ++ "/") {
      Js.String2.sliceToEnd(path, ~from=Js.String2.length(options.root) + 1)
    } else {
      path
    }
    matchPattern(pattern, relativePath)
  })
}

/** Glob multiple patterns */
let globMultiple = async (patterns: array<string>, options: globOptions): array<string> => {
  let results = ref([])

  for i in 0 to Belt.Array.length(patterns) - 1 {
    let pattern = Belt.Array.getUnsafe(patterns, i)
    let matches = await glob(pattern, options)
    results := Belt.Array.concat(results.contents, matches)
  }

  // Deduplicate
  let seen = Js.Dict.empty()
  results.contents->Belt.Array.keep(path => {
    switch Js.Dict.get(seen, path) {
    | Some(_) => false
    | None =>
      Js.Dict.set(seen, path, true)
      true
    }
  })
}

/** Find files by extension */
let findByExtension = async (ext: string, options: globOptions): array<string> => {
  let pattern = "**/*" ++ ext
  await glob(pattern, options)
}

/** Common file patterns */
module Patterns = {
  let allFiles = "**/*"
  let resFiles = "**/*.res"
  let jsFiles = "**/*.js"
  let tsFiles = "**/*.ts"
  let jsonFiles = "**/*.json"
  let mdFiles = "**/*.md"
  let txtFiles = "**/*.txt"
}
