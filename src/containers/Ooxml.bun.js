// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Jonathan D.A. Jewell
//
// Ooxml.bun.js — Office Open XML container detectors.
//
// DOCX / PPTX / XLSX are ZIP packages of XML parts. Two families of findings:
//
//   1. Negative-space *character* findings inside document text runs
//      (<w:t>, <a:t>, shared strings) — the "conversion artefacts" of the
//      issue, both as literal scalars and as escaped numeric character
//      references (&#160; & co), which pure-byte scanners miss entirely.
//   2. Hidden/zero-size *formatting* findings: vanish/webHidden runs,
//      sub-point font sizes, hidden shapes.
//
//   3. Spreadsheet formula cells whose displayed result is empty
//      (EMPTY_FORMULA_CELL), distinguishing formula / cached value / rendered
//      display per the issue.
//
// Positions are line/column/byte-offset within the named package member and
// reported as `<file.docx>::<member.xml>` so they remain findable.
// Packages are only ever read, never modified.

import { scanText } from "../core/ScalarScanner.bun.js";
import { forCodePoint } from "../core/UnicodeData.bun.js";
import { locate } from "./HiddenStyle.bun.js";

const FATAL_DECODER = new TextDecoder("utf-8", { fatal: true });

function decodeMember(name, bytes) {
  try {
    return FATAL_DECODER.decode(bytes);
  } catch {
    throw new Error(`member ${name} is not valid UTF-8`);
  }
}

function finding(member, position, fields) {
  const { line, column, byteOffset } = locate(position.text, position.offset);
  return {
    code_point: fields.code_point ?? null,
    utf8_hex: fields.utf8_hex ?? null,
    category: fields.category ?? "ooxml",
    severity: fields.severity ?? "warning",
    safety: fields.safety ?? "ambiguous",
    fix: fields.fix ?? { kind: "review" },
    line,
    column,
    byte_offset: byteOffset,
    scalar_index: position.offset,
    context_escaped: undefined,
    ...fields,
    member,
  };
}

// ── Text-run character scanning ──────────────────────────────────────────────

/**
 * Scan the *inner text* of XML text nodes (`<w:t>`, `<a:t>`, `<t>`) inside a
 * member for invisible characters — both literal scalars and escaped numeric
 * character references. Returns findings plus scanned scalar count.
 */
export function scanXmlTextNodes(member, xml, options, nodeNames) {
  const findings = [];
  let scannedScalars = 0;
  const nodePattern = new RegExp(`<(?:${nodeNames.join("|")})(?:\\s[^>]*)?>([\\s\\S]*?)</(?:${nodeNames.join("|")})>`, "gu");
  let match;
  while ((match = nodePattern.exec(xml)) !== null) {
    const innerXml = match[1];
    const innerStart = match.index + match[0].indexOf(innerXml);

    // Literal invisible scalars inside the run.
    const { findings: inner, scannedScalars: count } = scanText(innerXml, options);
    for (const f of inner) {
      findings.push({
        ...f,
        ...offsetInto(member, xml, innerStart, f),
        context_escaped: undefined,
      });
    }
    scannedScalars += count;

    // Escaped numeric character references (&#160; / &#xA0;).
    const entityPattern = /&#(x?[0-9a-fA-F]+);/gu;
    let entity;
    while ((entity = entityPattern.exec(innerXml)) !== null) {
      const cp = entity[1].startsWith("x") || entity[1].startsWith("X")
        ? Number.parseInt(entity[1].slice(1), 16)
        : Number.parseInt(entity[1], 10);
      if (!Number.isInteger(cp) || cp > 0x10ffff) continue;
      const def = forCodePoint(cp);
      if (def !== null) {
        findings.push(finding(member, { text: xml, offset: innerStart + entity.index }, {
          code_point: cp,
          utf8_hex: null,
          name: `${def.name}_ENTITY`,
          unicode_name: `${def.unicode_name} (numeric character reference)`,
          category: def.category,
          severity: def.severity,
          safety: def.safety,
          fix: { kind: "review" },
          description: `${def.description} — encoded as the literal entity "${entity[0]}", invisible to byte-level scanners.`,
        }));
      }
    }
  }
  return { findings, scannedScalars };
}

function offsetInto(member, xml, base, inner) {
  const absolute = base + (inner.scalar_index ?? 0);
  const { line, column, byteOffset } = locate(xml, absolute);
  return {
    member,
    line,
    column,
    byte_offset: byteOffset,
    scalar_index: absolute,
  };
}

// ── DOCX ──────────────────────────────────────────────────────────────────────

const WORD_TEXT_MEMBERS = /^word\/(?:document|header\d*|footer\d*|footnotes|endnotes|comments)\.xml$/u;

export function scanDocx(packagePath, members, options) {
  const findings = [];
  let scannedScalars = 0;

  for (const [name, bytes] of members) {
    if (!WORD_TEXT_MEMBERS.test(name)) continue;
    const xml = decodeMember(name, bytes);

    const runScan = scanXmlTextNodes(`${packagePath}::${name}`, xml, options, ["w:t", "w:instrText"]);
    findings.push(...runScan.findings);
    scannedScalars += runScan.scannedScalars;

    findings.push(...scanWordFormatting(`${packagePath}::${name}`, xml));
  }
  return { findings, scannedScalars };
}

function scanWordFormatting(member, xml) {
  const findings = [];

  // Hidden runs: <w:rPr> containing vanish or webHidden.
  const rprPattern = /<w:rPr>[\s\S]*?<\/w:rPr>/gu;
  let match;
  while ((match = rprPattern.exec(xml)) !== null) {
    const block = match[0];
    if (/<w:vanish\s*\/>/u.test(block)) {
      findings.push(finding(member, { text: xml, offset: match.index }, {
        name: "OOXML_HIDDEN_RUN",
        unicode_name: "WORD VANISH RUN",
        severity: "warning",
        description: "Run property w:vanish: text exists in the file but Word does not display or print it; a classic hidden-content channel.",
      }));
    }
    if (/<w:webHidden\s*\/>/u.test(block)) {
      findings.push(finding(member, { text: xml, offset: match.index }, {
        name: "OOXML_WEB_HIDDEN_RUN",
        unicode_name: "WORD WEB-HIDDEN RUN",
        severity: "info",
        description: "Run property w:webHidden: text hidden in web layout view.",
      }));
    }
    const sz = /<w:sz\s+w:val="(\d+)"\s*\/>/u.exec(block);
    if (sz && Number.parseInt(sz[1], 10) <= 2) {
      findings.push(finding(member, { text: xml, offset: match.index }, {
        name: "OOXML_SUSPICIOUS_FONT_SIZE",
        unicode_name: `WORD FONT SIZE ${Number.parseInt(sz[1], 10) / 2}pt`,
        severity: "warning",
        description: `Font size ${sz[1]} half-points (${Number.parseInt(sz[1], 10) / 2}pt): text renders effectively invisible.`,
      }));
    }
  }
  return findings;
}

// ── PPTX ──────────────────────────────────────────────────────────────────────

export function scanPptx(packagePath, members, options) {
  const findings = [];
  let scannedScalars = 0;

  for (const [name, bytes] of members) {
    if (!/^ppt\/slides\/slide\d+\.xml$/u.test(name)) continue;
    const xml = decodeMember(name, bytes);

    const runScan = scanXmlTextNodes(`${packagePath}::${name}`, xml, options, ["a:t"]);
    findings.push(...runScan.findings);
    scannedScalars += runScan.scannedScalars;

    const hiddenShape = /<p:(?:sp|pic|graphicFrame|grpSp|cxnSp)\b[^>]*\bhidden="1"/gu;
    let match;
    while ((match = hiddenShape.exec(xml)) !== null) {
      findings.push(finding(`${packagePath}::${name}`, { text: xml, offset: match.index }, {
        name: "OOXML_HIDDEN_SHAPE",
        unicode_name: "POWERPOINT HIDDEN SHAPE",
        severity: "info",
        description: 'Shape marked hidden="1": present in the file, excluded from rendering.',
      }));
    }
  }
  return { findings, scannedScalars };
}

// ── XLSX ──────────────────────────────────────────────────────────────────────

export function scanXlsx(packagePath, members, options) {
  const findings = [];
  let scannedScalars = 0;

  // Shared strings are text too — scan them for conversion artefacts.
  const shared = members.get("xl/sharedStrings.xml");
  if (shared) {
    const xml = decodeMember("xl/sharedStrings.xml", shared);
    const runScan = scanXmlTextNodes(`${packagePath}::xl/sharedStrings.xml`, xml, options, ["t"]);
    findings.push(...runScan.findings);
    scannedScalars += runScan.scannedScalars;
  }

  const sheetNames = resolveSheetNames(members);

  for (const [name, bytes] of members) {
    if (!/^xl\/worksheets\/sheet\d+\.xml$/u.test(name)) continue;
    const xml = decodeMember(name, bytes);
    const display = sheetNames.get(name) ?? name;

    const cellPattern = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/gu;
    let match;
    while ((match = cellPattern.exec(xml)) !== null) {
      const attrs = match[1] ?? "";
      const inner = match[2] ?? "";
      const ref = /\br="([A-Z]+\d+)"/u.exec(attrs)?.[1] ?? "?";

      const formulaMatch = /<f(?:\s[^>]*)?>([\s\S]*?)<\/f>/u.exec(inner) ?? /<f(?:\s[^>]*)?\/>/u.exec(inner);
      if (formulaMatch !== null) {
        const formula = (formulaMatch[1] ?? "").trim();
        const valueMatch = /<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/u.exec(inner);
        const hasValue = valueMatch !== null && valueMatch[1].trim() !== "";
        if (!hasValue) {
          findings.push(finding(`${packagePath}::${name}`, { text: xml, offset: match.index }, {
            name: "EMPTY_FORMULA_CELL",
            unicode_name: "FORMULA CELL WITH EMPTY CACHED VALUE",
            severity: "warning",
            description:
              `Cell ${display}!${ref} holds the formula ${formula.length > 0 ? `"${truncate(formula)}"` : "(empty formula element)"} ` +
              `but its cached value is ${valueMatch === null ? "absent" : "empty"}: the spreadsheet shows a blank cell whose content is a computation. ` +
              `Formula ≠ cached value ≠ rendered display; review before trusting the blank.`,
          }));
        }
      }
    }
  }
  return { findings, scannedScalars };
}

function truncate(formula, max = 80) {
  return formula.length <= max ? formula : `${formula.slice(0, max)}…`;
}

function resolveSheetNames(members) {
  const out = new Map();
  const workbook = members.get("xl/workbook.xml");
  const rels = members.get("xl/_rels/workbook.xml.rels");
  if (!workbook || !rels) return out;

  const workbookXml = decodeMember("xl/workbook.xml", workbook);
  const relsXml = decodeMember("xl/_rels/workbook.xml.rels", rels);

  const ridTargets = new Map();
  const relPattern = /<Relationship\b[^>]*?\bId="([^"]+)"[^>]*?\bTarget="([^"]+)"/gu;
  const relPatternAlt = /<Relationship\b[^>]*?\bTarget="([^"]+)"[^>]*?\bId="([^"]+)"/gu;
  let match;
  while ((match = relPattern.exec(relsXml)) !== null) ridTargets.set(match[1], match[2]);
  while ((match = relPatternAlt.exec(relsXml)) !== null) ridTargets.set(match[2], match[1]);

  const sheetPattern = /<sheet\b[^>]*?\bname="([^"]+)"[^>]*?\br:id="([^"]+)"/gu;
  const sheetPatternAlt = /<sheet\b[^>]*?\br:id="([^"]+)"[^>]*?\bname="([^"]+)"/gu;
  while ((match = sheetPattern.exec(workbookXml)) !== null) {
    const target = ridTargets.get(match[2]);
    if (target) out.set(`xl/${target.replace(/^\//u, "")}`, match[1]);
  }
  while ((match = sheetPatternAlt.exec(workbookXml)) !== null) {
    const target = ridTargets.get(match[1]);
    if (target) out.set(`xl/${target.replace(/^\//u, "")}`, match[2]);
  }
  return out;
}
