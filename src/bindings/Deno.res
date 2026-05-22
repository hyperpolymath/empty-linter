// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2025 Hyperpolymath
//
// Deno bindings for empty-linter
// Provides type-safe access to Deno runtime APIs

/** Deno namespace bindings */
module Deno = {
  /** Read a text file */
  @val external readTextFile: string => promise<string> = "Deno.readTextFile"

  /** Write a text file */
  @val external writeTextFile: (string, string) => promise<unit> = "Deno.writeTextFile"

  /** Read a binary file */
  @val external readFile: string => promise<Js.TypedArray2.Uint8Array.t> = "Deno.readFile"

  /** Write a binary file */
  @val external writeFile: (string, Js.TypedArray2.Uint8Array.t) => promise<unit> = "Deno.writeFile"

  /** File/directory info */
  type fileInfo = {
    isFile: bool,
    isDirectory: bool,
    isSymlink: bool,
    size: float,
    mtime: Js.Nullable.t<Js.Date.t>,
    atime: Js.Nullable.t<Js.Date.t>,
    birthtime: Js.Nullable.t<Js.Date.t>,
  }

  /** Get file info */
  @val external stat: string => promise<fileInfo> = "Deno.stat"

  /** Check if path exists */
  let exists = async (path: string): bool => {
    try {
      let _ = await stat(path)
      true
    } catch {
    | _ => false
    }
  }

  /** Directory entry */
  type dirEntry = {
    name: string,
    isFile: bool,
    isDirectory: bool,
    isSymlink: bool,
  }

  /** Read directory */
  @val external readDir: string => Js.AsyncIterator.t<dirEntry> = "Deno.readDir"

  /** Create directory */
  @val external mkdir: (string, {"recursive": bool}) => promise<unit> = "Deno.mkdir"

  /** Remove file or directory */
  @val external remove: (string, {"recursive": bool}) => promise<unit> = "Deno.remove"

  /** Copy file */
  @val external copyFile: (string, string) => promise<unit> = "Deno.copyFile"

  /** Rename/move file */
  @val external rename: (string, string) => promise<unit> = "Deno.rename"

  /** Current working directory */
  @val external cwd: unit => string = "Deno.cwd"

  /** Command line arguments (excludes deno and script name) */
  @val external args: array<string> = "Deno.args"

  /** Environment variables */
  module Env = {
    @val external get: string => option<string> = "Deno.env.get"
    @val external set: (string, string) => unit = "Deno.env.set"
    @val external delete: string => unit = "Deno.env.delete"
    @val external toObject: unit => Js.Dict.t<string> = "Deno.env.toObject"
  }

  /** Exit the process */
  @val external exit: int => unit = "Deno.exit"

  /** Standard streams */
  @val external stdout: 'a = "Deno.stdout"
  @val external stderr: 'a = "Deno.stderr"
  @val external stdin: 'a = "Deno.stdin"
}

/** Console bindings with colors */
module Console = {
  @val external log: string => unit = "console.log"
  @val external error: string => unit = "console.error"
  @val external warn: string => unit = "console.warn"
  @val external info: string => unit = "console.info"
  @val external debug: string => unit = "console.debug"
  @val external table: 'a => unit = "console.table"
  @val external time: string => unit = "console.time"
  @val external timeEnd: string => unit = "console.timeEnd"
  @val external clear: unit => unit = "console.clear"
}

/** ANSI color codes for terminal output */
module Colors = {
  let reset = "\x1b[0m"
  let bold = "\x1b[1m"
  let dim = "\x1b[2m"
  let italic = "\x1b[3m"
  let underline = "\x1b[4m"

  // Foreground colors
  let black = "\x1b[30m"
  let red = "\x1b[31m"
  let green = "\x1b[32m"
  let yellow = "\x1b[33m"
  let blue = "\x1b[34m"
  let magenta = "\x1b[35m"
  let cyan = "\x1b[36m"
  let white = "\x1b[37m"

  // Bright foreground
  let brightRed = "\x1b[91m"
  let brightGreen = "\x1b[92m"
  let brightYellow = "\x1b[93m"
  let brightMagenta = "\x1b[95m"

  // Background colors
  let bgRed = "\x1b[41m"
  let bgGreen = "\x1b[42m"
  let bgYellow = "\x1b[43m"
  let bgMagenta = "\x1b[45m"

  /** Wrap text in color */
  let wrap = (color: string, text: string): string => {
    color ++ text ++ reset
  }

  /** Colorize by severity */
  let bySeverity = (severity: string, text: string): string => {
    switch severity {
    | "critical" => wrap(brightRed ++ bold, text)
    | "error" => wrap(red, text)
    | "warning" => wrap(yellow, text)
    | "info" => wrap(cyan, text)
    | _ => text
    }
  }
}

/** Async iterator helpers */
module AsyncIter = {
  /** Collect async iterator to array */
  let toArray = async (iter: Js.AsyncIterator.t<'a>): array<'a> => {
    let results = ref([])
    let done = ref(false)

    while !done.contents {
      let next = await Js.AsyncIterator.next(iter)
      switch Js.AsyncIterator.value(next) {
      | Some(value) =>
        results := Belt.Array.concat(results.contents, [value])
      | None =>
        done := true
      }
    }

    results.contents
  }
}

/** Path utilities (cross-platform) */
module Path = {
  /** Join path segments */
  let join = (segments: array<string>): string => {
    Js.Array2.joinWith(segments, "/")
  }

  /** Get directory name */
  let dirname = (path: string): string => {
    let lastSlash = Js.String2.lastIndexOf(path, "/")
    if lastSlash <= 0 {
      "."
    } else {
      Js.String2.slice(path, ~from=0, ~to_=lastSlash)
    }
  }

  /** Get base name */
  let basename = (path: string): string => {
    let lastSlash = Js.String2.lastIndexOf(path, "/")
    if lastSlash < 0 {
      path
    } else {
      Js.String2.sliceToEnd(path, ~from=lastSlash + 1)
    }
  }

  /** Get extension */
  let extname = (path: string): string => {
    let base = basename(path)
    let lastDot = Js.String2.lastIndexOf(base, ".")
    if lastDot <= 0 {
      ""
    } else {
      Js.String2.sliceToEnd(base, ~from=lastDot)
    }
  }

  /** Normalize path (remove . and ..) */
  let normalize = (path: string): string => {
    let segments = Js.String2.split(path, "/")
    let result = ref([])

    segments->Belt.Array.forEach(seg => {
      switch seg {
      | "." | "" => ()
      | ".." =>
        if Belt.Array.length(result.contents) > 0 {
          result := Belt.Array.slice(result.contents, ~offset=0, ~len=Belt.Array.length(result.contents) - 1)
        }
      | s => result := Belt.Array.concat(result.contents, [s])
      }
    })

    let normalized = Js.Array2.joinWith(result.contents, "/")
    if Js.String2.startsWith(path, "/") {
      "/" ++ normalized
    } else {
      normalized
    }
  }
}
