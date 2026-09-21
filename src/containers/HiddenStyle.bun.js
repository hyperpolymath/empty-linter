// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Jonathan D.A. Jewell
//
// HiddenStyle.bun.js — hidden / zero-size / camouflaged text detection in
// markup and style sources (HTML, SVG, Markdown, CSS).
//
// This is a conservative PATTERN detector, not a layout engine: it matches
// the well-known hiding idioms at their source position and reports them as
// ambiguous findings for review. It does not resolve computed styles, class
// cascades, or external stylesheets — class names that hide text remotely are
// out of scope and documented as such.
//
// Severity policy: in `.css` files, hiding rules are everyday engineering
// (menus, collapsibles) → info. Inline in document markup they are
// content-hiding signals → warning.

/**
 * patterns: [name, regex, description, markupSeverity, cssSeverity]
 */
const PATTERNS = [
  ["HIDDEN_STYLE_ZERO_FONT", /font-size\s*:\s*0(?:\.0+)?(?:px|pt|em|rem|%)?(?![\w.])/iu,
    "zero-size font: text exists in the document but renders at zero size", "warning", "info"],
  ["HIDDEN_STYLE_TRANSPARENT", /color\s*:\s*transparent/iu,
    "transparent text colour: text exists but renders invisible on any background", "warning", "info"],
  ["HIDDEN_STYLE_SAME_COLOR", /color\s*:\s*(#[0-9a-f]{3,8})\s*;\s*background(?:-color)?\s*:\s*\1/iu,
    "text colour identical to background: camouflaged text", "warning", "warning"],
  ["HIDDEN_STYLE_OPACITY_ZERO", /opacity\s*:\s*0(?:\.0+)?(?![\d.])/iu,
    "zero-opacity element: rendered content is fully transparent", "warning", "info"],
  ["HIDDEN_STYLE_DISPLAY_NONE", /display\s*:\s*none/iu,
    "display:none: content is present in the source but not rendered", "info", "info"],
  ["HIDDEN_STYLE_VISIBILITY", /visibility\s*:\s*(?:hidden|collapse)/iu,
    "visibility hidden: content is present but not rendered", "info", "info"],
  ["HIDDEN_STYLE_OFFSCREEN_INDENT", /text-indent\s*:\s*-\d{3,}(?:px|em|rem)/iu,
    "large negative text-indent: content pushed off-screen", "warning", "info"],
  ["HIDDEN_STYLE_HIDDEN_ATTR", /<\w+[^>]*\s(?:hidden|aria-hidden\s*=\s*"true")[\s>]/iu,
    "hidden attribute: element content excluded from rendering/accessibility tree", "info", "info"],
  ["HIDDEN_STYLE_CLIP", /clip(?:-path)?\s*:\s*(?:rect\(\s*0(?:px)?[,\s]+0(?:px)?[,\s]+0(?:px)?[,\s]+0(?:px)?\s*\)|inset\(\s*50%\s*\))/iu,
    "clipped-to-nothing content: classic visually-hidden technique (screen-reader text)", "info", "info"],
];

const MARKUP_EXTENSIONS = new Set([".html", ".htm", ".svg", ".md", ".xml"]);

/**
 * Scan markup/stylesheet source text for hidden-text idioms.
 * @param {string} text decoded source
 * @param {string} extension lowercased file extension (with dot)
 * @returns {object[]} findings (line/column/byte_offset source-scalar based)
 */
export function scanHiddenStyles(text, extension) {
  const isCss = extension === ".css";
  if (!isCss && !MARKUP_EXTENSIONS.has(extension)) return [];

  const findings = [];
  for (const [name, regex, description, markupSeverity, cssSeverity] of PATTERNS) {
    const global = new RegExp(regex.source, regex.flags.includes("g") ? regex.flags : regex.flags + "g");
    let match;
    while ((match = global.exec(text)) !== null) {
      const { line, column, byteOffset } = locate(text, match.index);
      findings.push({
        code_point: null,
        utf8_hex: null,
        name,
        unicode_name: "HIDDEN / CAMOUFLAGED TEXT IDIOM",
        category: "markup",
        severity: isCss ? cssSeverity : markupSeverity,
        safety: "ambiguous",
        fix: { kind: "review" },
        description: `${description} — matched at source position, review before removal (may be intentional, e.g. accessibility text / collapsible UI).`,
        line,
        column,
        byte_offset: byteOffset,
        scalar_index: match.index,
        context_escaped: undefined,
      });
      if (regex.global && match[0].length === 0) global.lastIndex += 1; // zero-width guard
    }
  }
  findings.sort((a, b) => a.byte_offset - b.byte_offset);
  return findings;
}

/** 1-based line/column + 0-based UTF-8 byte offset for a scalar index. */
export function locate(text, scalarIndex) {
  let line = 1;
  let column = 1;
  let byteOffset = 0;
  let index = 0;
  for (const scalar of text) {
    if (index === scalarIndex) break;
    const cp = scalar.codePointAt(0);
    if (cp === 0x0a) { line += 1; column = 1; } else { column += 1; }
    byteOffset += cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
    index += 1;
  }
  return { line, column, byteOffset };
}
