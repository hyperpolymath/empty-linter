// SPDX-License-Identifier: PMPL-1.0
// SPDX-FileCopyrightText: 2025 Hyperpolymath

/**
 * SafeString - String operations that cannot crash.
 *
 * Provides safe escaping for SQL, HTML, and JavaScript.
 */

/** Escape a string for safe SQL interpolation */
let escapeSql = (value: string): string => {
  Js.String2.replaceByRe(value, %re("/'/g"), "''")
}

/** Escape a string for safe HTML insertion */
let escapeHtml = (value: string): string => {
  value
  ->Js.String2.replaceByRe(%re("/&/g"), "&amp;")
  ->Js.String2.replaceByRe(%re("/</g"), "&lt;")
  ->Js.String2.replaceByRe(%re("/>/g"), "&gt;")
  ->Js.String2.replaceByRe(%re("/\"/g"), "&quot;")
  ->Js.String2.replaceByRe(%re("/'/g"), "&#x27;")
}

/** Escape a string for safe JavaScript string literal insertion */
let escapeJs = (value: string): string => {
  value
  ->Js.String2.replaceByRe(%re("/\\\\/g"), "\\\\")
  ->Js.String2.replaceByRe(%re("/\"/g"), "\\\"")
  ->Js.String2.replaceByRe(%re("/'/g"), "\\'")
  ->Js.String2.replaceByRe(%re("/\n/g"), "\\n")
  ->Js.String2.replaceByRe(%re("/\r/g"), "\\r")
  ->Js.String2.replaceByRe(%re("/\t/g"), "\\t")
}
