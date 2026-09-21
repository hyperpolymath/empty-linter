// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Jonathan D.A. Jewell
//
// UnicodeData.bun.js — the expanded Empty-linter detector catalogue.
//
// This module is the single source of truth for which Unicode scalars the
// scanner flags, their severity, and — crucially for safe repair — their
// safety class:
//
//   mechanical  Removal (or mapping to ASCII space) cannot change the rendered
//               text: the code point has no glyph and no shaping, line-break,
//               or directional semantics. Safe to apply without review.
//   semantic    The code point participates in meaning: joiners, variation
//               selectors, script format controls, invisible math operators.
//               Never removed solely because it is invisible.
//   ambiguous   Genuinely context dependent (bidi controls, soft hyphens,
//               tag characters, exotic spacing). Default action is "keep"
//               unless a human approves the change explicitly.
//
// Severity strings map onto the legacy Severity constructors in
// ByteDetector.bun.js ("critical" <-> Critical, "error" <-> SevError).
//
// Data follows Unicode 15.x general categories except U+180E, which Unicode
// 14.0 reclassified from Zs to Cf; we record it as Cf.

export const CATALOGUE_VERSION = "2.0.0";

const C = "critical";
const E = "error";
const W = "warning";
const I = "info";

export const SEVERITY_ORDER = new Map([[I, 1], [W, 2], [E, 3], [C, 4]]);

// ── Code-point entry helpers ──────────────────────────────────────────────────

function entry(codePoint, name, unicodeName, category, severity, safety, fix, description) {
  return Object.freeze({
    code_point: codePoint,
    name,
    unicode_name: unicodeName,
    category,
    severity,
    safety,
    // fix: { kind: "remove" } | { kind: "replace", with: string }
    //    | { kind: "keep" }   | { kind: "review" }
    fix,
    description,
  });
}

const remove = { kind: "remove" };
const keep = { kind: "keep" };
const review = { kind: "review" };
const space = { kind: "replace", with: " " };

// Exact, individually named single-code-point definitions.
const EXACT = [
  // ── Legacy minimum-gate set (metadata preserved from ByteDetector.affine) ──
  entry(0x0000, "NULL", "NULL", "Cc", C, "mechanical", remove,
    "Null byte; corrupts many parsers and truncates C-string consumers."),
  entry(0x00A0, "NBSP", "NO-BREAK SPACE", "Zs", E, "mechanical", space,
    "Non-breaking space; commonly paste-borne, breaks keyword/token matching and line wrapping."),
  entry(0x200B, "ZWSP", "ZERO WIDTH SPACE", "Cf", E, "mechanical", remove,
    "Zero-width space; invisible break opportunity, frequent paste/conversion artefact."),
  entry(0xFEFF, "BOM", "ZERO WIDTH NO-BREAK SPACE", "Cf", W, "mechanical", remove,
    "Byte order mark; only meaningful as a leading file signature, invisible elsewhere."),
  entry(0x00AD, "SHY", "SOFT HYPHEN", "Cf", I, "ambiguous", review,
    "Soft hyphen; invisible hyphenation hint that changes line breaking when present."),
  entry(0x200E, "LRM", "LEFT-TO-RIGHT MARK", "Cf", I, "ambiguous", review,
    "Left-to-right mark; directional mark that may be intentional in bidi text."),
  entry(0x200F, "RLM", "RIGHT-TO-LEFT MARK", "Cf", I, "ambiguous", review,
    "Right-to-left mark; directional mark that may be intentional in bidi text."),
  entry(0x2060, "WJ", "WORD JOINER", "Cf", I, "ambiguous", review,
    "Word joiner; invisible glue that suppresses line breaks at its position."),
  entry(0x200C, "ZWNJ", "ZERO WIDTH NON-JOINER", "Cf", W, "semantic", keep,
    "Zero-width non-joiner; changes cursive joining and ligature formation. Never auto-removed."),
  entry(0x200D, "ZWJ", "ZERO WIDTH JOINER", "Cf", W, "semantic", keep,
    "Zero-width joiner; builds emoji sequences and joins Indic/Arabic forms. Never auto-removed."),

  // ── Bidirectional controls (Trojan Source class) ───────────────────────────
  entry(0x061C, "ALM", "ARABIC LETTER MARK", "Cf", I, "semantic", keep,
    "Arabic letter mark; sets direction of adjacent punctuation in Arabic text."),
  entry(0x202A, "LRE", "LEFT-TO-RIGHT EMBEDDING", "Cf", E, "ambiguous", review,
    "Bidi embedding; reorders rendered text (Trojan Source risk)."),
  entry(0x202B, "RLE", "RIGHT-TO-LEFT EMBEDDING", "Cf", E, "ambiguous", review,
    "Bidi embedding; reorders rendered text (Trojan Source risk)."),
  entry(0x202C, "PDF", "POP DIRECTIONAL FORMATTING", "Cf", E, "ambiguous", review,
    "Pops a bidi embedding/override; its removal strands or orphans directional state."),
  entry(0x202D, "LRO", "LEFT-TO-RIGHT OVERRIDE", "Cf", C, "ambiguous", review,
    "Bidi override; forces rendering order against logical order (CVE-2021-42574 class)."),
  entry(0x202E, "RLO", "RIGHT-TO-LEFT OVERRIDE", "Cf", C, "ambiguous", review,
    "Bidi override; forces rendering order against logical order (CVE-2021-42574 class)."),
  entry(0x2066, "LRI", "LEFT-TO-RIGHT ISOLATE", "Cf", E, "ambiguous", review,
    "Bidi isolate; legitimate in i18n UI strings, suspicious in source."),
  entry(0x2067, "RLI", "RIGHT-TO-LEFT ISOLATE", "Cf", E, "ambiguous", review,
    "Bidi isolate; legitimate in i18n UI strings, suspicious in source."),
  entry(0x2068, "FSI", "FIRST STRONG ISOLATE", "Cf", E, "ambiguous", review,
    "Bidi isolate; legitimate in i18n UI strings, suspicious in source."),
  entry(0x2069, "PDI", "POP DIRECTIONAL ISOLATE", "Cf", E, "ambiguous", review,
    "Pops a bidi isolate; removing it corrupts isolate pairing."),

  // ── Separators and exotic spacing (Unicode Zs / Zl / Zp) ───────────────────
  entry(0x1680, "OGHAM SPACE", "OGHAM SPACE MARK", "Zs", I, "ambiguous", space,
    "Ogham space; visible in some fonts, blank in most web fonts — frequent disguised-space abuse."),
  entry(0x2000, "EN QUAD", "EN QUAD", "Zs", I, "ambiguous", space, "Typographic en-width space."),
  entry(0x2001, "EM QUAD", "EM QUAD", "Zs", I, "ambiguous", space, "Typographic em-width space."),
  entry(0x2002, "EN SPACE", "EN SPACE", "Zs", I, "ambiguous", space, "En-width space; polices alignment invisibly."),
  entry(0x2003, "EM SPACE", "EM SPACE", "Zs", I, "ambiguous", space, "Em-width space; polices alignment invisibly."),
  entry(0x2004, "THREE-PER-EM SPACE", "THREE-PER-EM SPACE", "Zs", I, "ambiguous", space, "One-third em space."),
  entry(0x2005, "FOUR-PER-EM SPACE", "FOUR-PER-EM SPACE", "Zs", I, "ambiguous", space, "One-quarter em space."),
  entry(0x2006, "SIX-PER-EM SPACE", "SIX-PER-EM SPACE", "Zs", I, "ambiguous", space, "One-sixth em space."),
  entry(0x2007, "FIGURE SPACE", "FIGURE SPACE", "Zs", I, "ambiguous", space,
    "Digit-width space; silently defeats numeric column detection."),
  entry(0x2008, "PUNCTUATION SPACE", "PUNCTUATION SPACE", "Zs", I, "ambiguous", space, "Period-width space."),
  entry(0x2009, "THIN SPACE", "THIN SPACE", "Zs", I, "ambiguous", space,
    "Thin space; legitimate in French typography, invisible alignment lever elsewhere."),
  entry(0x200A, "HAIR SPACE", "HAIR SPACE", "Zs", I, "ambiguous", space, "Narrowest typographic space."),
  entry(0x202F, "NNBSP", "NARROW NO-BREAK SPACE", "Zs", I, "ambiguous", space,
    "Narrow non-breaking space; required in French typography, paste artefact elsewhere."),
  entry(0x205F, "MMSP", "MEDIUM MATHEMATICAL SPACE", "Zs", I, "ambiguous", space,
    "Medium mathematical space; 4/18-em, invisible outside math text."),
  entry(0x3000, "IDEOGRAPHIC SPACE", "IDEOGRAPHIC SPACE", "Zs", I, "ambiguous", space,
    "Full-width CJK space; normal in CJK text, a disguised invisible gap in Latin source."),
  entry(0x2028, "LS", "LINE SEPARATOR", "Zl", W, "mechanical", { kind: "replace", with: "\n" },
    "Unicode line separator; invisible in many editors, syntactically significant in some formats (e.g. JS strings)."),
  entry(0x2029, "PS", "PARAGRAPH SEPARATOR", "Zp", W, "mechanical", { kind: "replace", with: "\n" },
    "Unicode paragraph separator; invisible in many editors, syntactically significant in some formats."),

  // ── Deprecated and interlinear format controls ─────────────────────────────
  entry(0x206A, "ISS", "INHIBIT SYMMETRIC SWAPPING", "Cf", W, "mechanical", remove,
    "Deprecated bidi format control; Unicode deprecated, no modern consumer honours it."),
  entry(0x206B, "ASS", "ACTIVATE SYMMETRIC SWAPPING", "Cf", W, "mechanical", remove,
    "Deprecated bidi format control; Unicode deprecated."),
  entry(0x206C, "IAFS", "INHIBIT ARABIC FORM SHAPING", "Cf", W, "mechanical", remove,
    "Deprecated Arabic shaping control; Unicode deprecated."),
  entry(0x206D, "AAFS", "ACTIVATE ARABIC FORM SHAPING", "Cf", W, "mechanical", remove,
    "Deprecated Arabic shaping control; Unicode deprecated."),
  entry(0x206E, "NADS", "NATIONAL DIGIT SHAPES", "Cf", W, "mechanical", remove,
    "Deprecated digit-shaping control; Unicode deprecated."),
  entry(0x206F, "NODS", "NOMINAL DIGIT SHAPES", "Cf", W, "mechanical", remove,
    "Deprecated digit-shaping control; Unicode deprecated."),

  // ── Invisible mathematical operators ───────────────────────────────────────
  entry(0x2061, "FUNCTION APPLICATION", "FUNCTION APPLICATION", "Cf", W, "semantic", keep,
    "Invisible math operator; distinguishes f(x) from f times x in formal math."),
  entry(0x2062, "INVISIBLE TIMES", "INVISIBLE TIMES", "Cf", W, "semantic", keep,
    "Invisible multiplication; semantic in mathematical text."),
  entry(0x2063, "INVISIBLE SEPARATOR", "INVISIBLE SEPARATOR", "Cf", W, "semantic", keep,
    "Invisible comma; semantic in mathematical text."),
  entry(0x2064, "INVISIBLE PLUS", "INVISIBLE PLUS", "Cf", W, "semantic", keep,
    "Invisible addition; semantic in mathematical text."),

  // ── Script format controls (Cf, semantic to their scripts) ─────────────────
  entry(0x0600, "ARABIC NUMBER SIGN", "ARABIC NUMBER SIGN", "Cf", I, "semantic", keep,
    "Arabic number sign; changes the display of the digits it precedes."),
  entry(0x0601, "ARABIC SIGN SANAH", "ARABIC SIGN SANAH", "Cf", I, "semantic", keep, "Arabic year sign."),
  entry(0x0602, "ARABIC FOOTNOTE MARKER", "ARABIC FOOTNOTE MARKER", "Cf", I, "semantic", keep, "Arabic footnote marker."),
  entry(0x0603, "ARABIC SIGN SAFHA", "ARABIC SIGN SAFHA", "Cf", I, "semantic", keep, "Arabic page sign."),
  entry(0x0604, "ARABIC SIGN SAMVAT", "ARABIC SIGN SAMVAT", "Cf", I, "semantic", keep, "Arabic Samvat sign."),
  entry(0x0605, "ARABIC NUMBER MARK ABOVE", "ARABIC NUMBER MARK ABOVE", "Cf", I, "semantic", keep,
    "Arabic number mark; may suppress rendering and place a mark above following digits."),
  entry(0x06DD, "ARABIC END OF AYAH", "ARABIC END OF AYAH", "Cf", I, "semantic", keep,
    "End-of-ayah mark; Quranic text, suppresses the following digits' glyph."),
  entry(0x070F, "SAM", "SYRIAC ABBREVIATION MARK", "Cf", W, "semantic", keep,
    "Syriac abbreviation mark; renders following letters with an overline; abused for invisible text."),
  entry(0x0890, "ARABIC POUND MARK ABOVE", "ARABIC POUND MARK ABOVE", "Cf", I, "semantic", keep, "Arabic pound mark; annotates following digits."),
  entry(0x0891, "ARABIC PIASTRE MARK ABOVE", "ARABIC PIASTRE MARK ABOVE", "Cf", I, "semantic", keep, "Arabic piastre mark; annotates following digits."),
  entry(0x08E2, "ARABIC DISPUTED END OF AYAH", "ARABIC DISPUTED END OF AYAH", "Cf", I, "semantic", keep, "Arabic disputed end of ayah."),
  entry(0x180E, "MVS", "MONGOLIAN VOWEL SEPARATOR", "Cf", W, "semantic", keep,
    "Mongolian vowel separator; Mongolian shaping (Cf since Unicode 14)."),

  // ── Grapheme join control ───────────────────────────────────────────────────
  entry(0x034F, "CGJ", "COMBINING GRAPHEME JOINER", "Mn", W, "semantic", keep,
    "Combining grapheme joiner; blocks canonical reordering of combining marks. Never auto-removed."),

  // ── Object/interlinear markers and replacement evidence ────────────────────
  entry(0xFFFC, "ORC", "OBJECT REPLACEMENT CHARACTER", "So", W, "ambiguous", review,
    "Placeholder for an embedded object; removing it detaches the object it stands for."),
  entry(0xFFFD, "REPLACEMENT CHAR", "REPLACEMENT CHARACTER", "So", E, "ambiguous", review,
    "Evidence of prior encoding corruption; removing it conceals the loss. Fix the byte source instead."),
  entry(0xFFF9, "IAA", "INTERLINEAR ANNOTATION ANCHOR", "Cf", W, "semantic", keep,
    "Interlinear annotation anchor; marks annotated text."),
  entry(0xFFFA, "IAS", "INTERLINEAR ANNOTATION SEPARATOR", "Cf", W, "semantic", keep,
    "Interlinear annotation separator; splits base text from annotation."),
  entry(0xFFFB, "IAT", "INTERLINEAR ANNOTATION TERMINATOR", "Cf", W, "semantic", keep,
    "Interlinear annotation terminator; ends an annotation block."),

  // ── Fillers and blank patterns ──────────────────────────────────────────────
  entry(0x3164, "HANGUL FILLER", "HANGUL FILLER", "Lo", W, "ambiguous", review,
    "Hangul filler; blank-rendering letter, the classic invisible-username character."),
  entry(0xFFA0, "HALFWIDTH HANGUL FILLER", "HALFWIDTH HANGUL FILLER", "Lo", W, "ambiguous", review,
    "Halfwidth hangul filler; blank-rendering compatibility letter."),
  entry(0x115F, "HANGUL CHOSEONG FILLER", "HANGUL CHOSEONG FILLER", "Lo", I, "ambiguous", review,
    "Hangul choseong filler; meaningful in jamo composition, blank alone."),
  entry(0x1160, "HANGUL JUNGSEONG FILLER", "HANGUL JUNGSEONG FILLER", "Lo", I, "ambiguous", review,
    "Hangul jungseong filler; meaningful in jamo composition, blank alone."),
  entry(0x2800, "BRAILLE BLANK", "BRAILLE PATTERN BLANK", "So", I, "ambiguous", review,
    "Blank braille cell; legitimate in braille output, a reliable invisible spacer elsewhere."),

  // ── Noncharacters and reversed BOM ──────────────────────────────────────────
  entry(0xFFFE, "REVERSED BOM", "<noncharacter-FFFE>", "Cn", C, "mechanical", remove,
    "U+FFFE is a permanently reserved noncharacter; its presence marks a byte-order or encoding error."),
];

const BY_CODE_POINT = new Map(EXACT.map((definition) => [definition.code_point, definition]));

// The C1 control abbreviations (0x80–0x9F), in order.
const C1_NAMES = [
  "PAD", "HOP", "BPH", "NBH", "IND", "NEL", "SSA", "ESA",
  "HTS", "HTJ", "VTS", "PLD", "PLU", "RI", "SS2", "SS3",
  "DCS", "PU1", "PU2", "STS", "CCH", "MW", "SPA", "EPA",
  "SOS", "SGCI", "SCI", "CSI", "ST", "OSC", "PM", "APC",
];

// C0 control abbreviations for the unsafe subset (tab/LF/CR are text whitespace
// and never flagged).
const C0_NAMES = new Map([
  [1, "SOH"], [2, "STX"], [3, "ETX"], [4, "EOT"], [5, "ENQ"], [6, "ACK"],
  [7, "BEL"], [8, "BS"], [11, "VT"], [12, "FF"], [14, "SO"], [15, "SI"],
  [16, "DLE"], [17, "DC1"], [18, "DC2"], [19, "DC3"], [20, "DC4"],
  [21, "NAK"], [22, "SYN"], [23, "ETB"], [24, "CAN"], [25, "EM"],
  [26, "SUB"], [27, "ESC"], [28, "FS"], [29, "GS"], [30, "RS"], [31, "US"],
]);

/**
 * Look up the catalogue definition for a Unicode scalar value.
 * Range-defined classes (C0/C1 controls, tags, variation selectors,
 * noncharacters) are resolved by predicate; everything else by exact table.
 *
 * @param {number} cp Unicode scalar value
 * @returns {object|null} frozen catalogue entry, or null if unflagged
 */
export function forCodePoint(cp) {
  const exact = BY_CODE_POINT.get(cp);
  if (exact) return exact;

  // Unsafe C0 controls (0x09 tab, 0x0A LF, 0x0D CR are text whitespace).
  if ((cp >= 0x01 && cp <= 0x08) || cp === 0x0b || cp === 0x0c || (cp >= 0x0e && cp <= 0x1f)) {
    const abbr = C0_NAMES.get(cp) ?? "CTRL";
    return Object.freeze({
      code_point: cp,
      name: "C0_CONTROL",
      unicode_name: `<control-${abbr}>`,
      category: "Cc",
      severity: C,
      safety: "mechanical",
      fix: review,
      description: `Unsafe C0 control (${abbr}); no rendering semantics in UTF-8 text, usually corruption.`,
    });
  }

  if (cp === 0x7f) {
    return Object.freeze({
      code_point: cp, name: "DELETE", unicode_name: "<control-DELETE>",
      category: "Cc", severity: C, safety: "mechanical", fix: review,
      description: "DEL control character; often a stale-edit artefact in terminal-sourced text.",
    });
  }

  // C1 controls.
  if (cp >= 0x80 && cp <= 0x9f) {
    const abbr = C1_NAMES[cp - 0x80];
    return Object.freeze({
      code_point: cp,
      name: `C1_${abbr}`,
      unicode_name: `<control-${abbr}>`,
      category: "Cc",
      severity: cp === 0x85 ? W : E, // NEL is occasionally intentional
      safety: "mechanical",
      fix: review,
      description: `C1 control (${abbr}); invisible terminal protocol bytes with no place in documents.`,
    });
  }

  // Tags block: U+E0000..U+E007F. Used for language tagging and ASCII
  // steganography; invisible by definition.
  if (cp >= 0xe0001 && cp <= 0xe007f) {
    if (cp === 0xe0001) {
      return freeze_("LANGUAGE TAG", "LANGUAGE TAG", W, "ambiguous", review,
        "Tag language marker; deprecated tagging mechanism, invisible.");
    }
    if (cp === 0xe007f) {
      return freeze_("CANCEL TAG", "CANCEL TAG", E, "ambiguous", review,
        "Tag terminator; orphaned cancel tags typically indicate tag-smuggling.");
    }
    return freeze_("TAG CHARACTER", `TAG ${tagCharName(cp)}`, E, "ambiguous", review,
      `Tag character encoding ASCII 0x${(cp - 0xe0000).toString(16).toUpperCase()}; classic invisible-data smuggling vector.`);
  }

  // Variation selectors: glyph choice. Removal changes rendering → semantic.
  if (cp >= 0xfe00 && cp <= 0xfe0f) {
    return freeze_(`VS${cp - 0xfe00 + 1}`, `VARIATION SELECTOR-${cp - 0xfe00 + 1}`, W, "semantic", keep,
      "Variation selector; picks a glyph variant (text vs emoji presentation). Never auto-removed.");
  }
  if (cp >= 0xe0100 && cp <= 0xe01ef) {
    return freeze_(`VS${cp - 0xe0100 + 17}`, `VARIATION SELECTOR-${cp - 0xe0100 + 17}`, W, "semantic", keep,
      "Supplementary variation selector; picks a CJK glyph variant. Never auto-removed.");
  }

  // Shorthand / musical / Egyptian format controls: semantic to their notations.
  if (cp >= 0x1bca0 && cp <= 0x1bca3) {
    return freeze_("SHORTHAND FORMAT", `SHORTHAND FORMAT LETTER CONTROL U+${hex(cp)}`, I, "semantic", keep,
      "Duployan shorthand format control; semantic to shorthand text.");
  }
  if (cp >= 0x1d173 && cp <= 0x1d17a) {
    return freeze_("MUSICAL FORMAT", `MUSICAL SYMBOL CONTROL U+${hex(cp)}`, I, "semantic", keep,
      "Musical notation format control (begin/end beam, slur, tie, phrase).");
  }
  if (cp >= 0x13430 && cp <= 0x13438) {
    return freeze_("EGYPTIAN FORMAT", `EGYPTIAN HIEROGLYPH FORMAT CONTROL U+${hex(cp)}`, I, "semantic", keep,
      "Egyptian hieroglyph quadrant format control; semantic to hieroglyphic text.");
  }
  if (cp === 0x110bd || cp === 0x110cd) {
    return freeze_("KAITHI NUMBER SIGN", cp === 0x110bd ? "KAITHI NUMBER SIGN" : "KAITHI NUMBER SIGN ABOVE",
      W, "ambiguous", review, "Kaithi number sign; invisible sign that marks following digits.");
  }

  // Noncharacters: U+FDD0..U+FDEF and the last two scalars of every plane.
  if ((cp >= 0xfdd0 && cp <= 0xfdef) || ((cp & 0xfffe) === 0xfffe && cp <= 0x10ffff)) {
    return freeze_("NONCHARACTER", `<noncharacter-${hex(cp)}>`, E, "ambiguous", review,
      "Permanently reserved noncharacter; reserved for internal sentinel use, not interchange text.");
  }

  return null;

  function freeze_(name, unicodeName, severity, safety, fix, description) {
    return Object.freeze({ code_point: cp, name, unicode_name: unicodeName, category: categoryFor(cp), severity, safety, fix, description });
  }
}

// Category for range-derived entries (Cf block vs Mn variation selectors vs Cn).
function categoryFor(cp) {
  if ((cp >= 0xfe00 && cp <= 0xfe0f) || (cp >= 0xe0100 && cp <= 0xe01ef)) return "Mn";
  if (cp >= 0xe0001 && cp <= 0xe007f) return "Cf";
  if (cp >= 0xf0000) return "Cf";
  return "Cn";
}

function tagCharName(cp) {
  const code = cp - 0xe0000;
  if (code >= 0x30 && code <= 0x39) return `DIGIT ${"ZERO ONE TWO THREE FOUR FIVE SIX SEVEN EIGHT NINE".split(" ")[code - 0x30]}`;
  if (code >= 0x41 && code <= 0x5a) return `LATIN CAPITAL LETTER ${String.fromCodePoint(code)}`;
  if (code >= 0x61 && code <= 0x7a) return `LATIN SMALL LETTER ${String.fromCodePoint(code).toUpperCase()}`;
  return `U+${hex(cp)}`;
}

/** Uppercase, minimum-4-digit hex of a code point, without the "U+" prefix. */
export function hex(cp) {
  return cp.toString(16).toUpperCase().padStart(4, "0");
}

/**
 * UTF-8 byte sequence for a scalar as an array of byte values.
 * The scanner input has already passed a fatal UTF-8 decoder, so scalars are
 * well-formed here.
 */
export function utf8Bytes(cp) {
  if (cp < 0x80) return [cp];
  if (cp < 0x800) return [0xc0 | (cp >> 6), 0x80 | (cp & 0x3f)];
  if (cp < 0x10000) return [0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f)];
  return [0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f)];
}

/** UTF-8 bytes rendered as uppercase hex, e.g. "C2 A0". */
export function utf8Hex(cp) {
  return utf8Bytes(cp).map((b) => b.toString(16).toUpperCase().padStart(2, "0")).join(" ");
}

/** Byte length of a scalar's UTF-8 encoding. */
export function utf8Length(cp) {
  return cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
}

/** Every catalogue entry whose definition is a fixed single code point. */
export function exactEntries() {
  return EXACT;
}
