# SPDX-License-Identifier: PMPL-1.0-or-later
# SPDX-FileCopyrightText: 2025 Hyperpolymath
#
# empty-linter configuration
# Idris Inside - Uses proven library for mathematically verified operations

let Severity = [| 'Critical, 'Error, 'Warning, 'Info |] in
let LineEnding = [| 'LF, 'CRLF, 'CR |] in
let OutputFormat = [| 'text, 'json, 'hex |] in

{
  # Proven library integration
  proven = {
    enabled = true,
    modules = {
      safe_hex = true,      # Constant-time hex encoding
      safe_path = true,     # Traversal-proof paths
      safe_string = true,   # XSS/SQL injection prevention
      safe_whitespace = true, # Text normalization (NEW module)
    },
  },

  # Core linter configuration
  linter = {
    target_dir = ".",
    overlay_color = "magenta",
    auto_fix = false,  # Conservative default - require explicit opt-in
    min_severity = 'Warning,
    output_format = 'text,

    # Path handling (uses proven SafePath)
    exclude_paths = ["node_modules", ".git", "lib", "dist", "build", ".cache"],

    # Known invisible artifacts (uses proven SafeHex for detection)
    artifacts = [
      { name = "NULL", hex = "0x00", severity = 'Critical, fix_action = "remove" },
      { name = "NBSP", hex = "0xA0", severity = 'Error, fix_action = "replace:20" },
      { name = "ZWSP", hex = "0x200B", severity = 'Error, fix_action = "remove" },
      { name = "BOM", hex = "0xFEFF", severity = 'Warning, fix_action = "remove" },
      { name = "SHY", hex = "0xAD", severity = 'Info, fix_action = "remove" },
      { name = "LRM", hex = "0x200E", severity = 'Info, fix_action = "remove" },
      { name = "RLM", hex = "0x200F", severity = 'Info, fix_action = "remove" },
      { name = "WJ", hex = "0x2060", severity = 'Info, fix_action = "remove" },
      { name = "ZWNJ", hex = "0x200C", severity = 'Warning, fix_action = "keep" },  # Semantic
      { name = "ZWJ", hex = "0x200D", severity = 'Warning, fix_action = "keep" },   # Semantic (emojis)
    ],
  },

  # Text transformation options (uses proven SafeWhitespace)
  transform = {
    default = {
      trim_lines = true,
      trim_document = true,
      collapse_spaces = true,
      normalize_line_endings = true,
      target_line_ending = 'LF,
      max_blank_lines = 2,
      remove_invisibles = true,
      ensure_final_newline = true,
    },

    strict = {
      trim_lines = true,
      trim_document = true,
      collapse_spaces = true,
      normalize_line_endings = true,
      target_line_ending = 'LF,
      max_blank_lines = 1,
      remove_invisibles = true,
      ensure_final_newline = true,
    },

    minimal = {
      trim_lines = false,
      trim_document = false,
      collapse_spaces = false,
      normalize_line_endings = true,
      target_line_ending = 'LF,
      max_blank_lines = 100,  # Effectively unlimited
      remove_invisibles = true,
      ensure_final_newline = false,
    },
  },

  # Predefined workspaces with constraints
  workspaces = {
    twitter = {
      constraints = { max_chars = 280 },
      transform = "strict",
    },
    linkedin = {
      constraints = { max_chars = 3000, max_words = 500 },
      transform = "default",
    },
    github_issue = {
      constraints = { max_chars = 65536 },
      transform = "minimal",
    },
    jira = {
      constraints = { max_chars = 32767, max_lines = 100 },
      transform = "default",
    },
    email = {
      constraints = { max_lines = 200 },
      transform = "default",
    },
  },

  # dotmatrix-fileprinter integration
  dotmatrix = {
    enabled = false,  # Enable when dotmatrix-fileprinter is available
    ipc_mode = "stdio",  # "stdio" | "socket" | "http"
    socket_path = "/tmp/dotmatrix.sock",
    hex_dump_format = "dotmatrix",  # Uses proven SafeHex
  },

  # Output formatting (uses proven SafeString for escaping)
  output = {
    html_escape = true,   # XSS-proof HTML output
    js_escape = true,     # Injection-proof JS strings
    sql_escape = false,   # Only if database logging enabled
  },
}
