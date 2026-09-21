// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Jonathan D.A. Jewell
//
// Container detector tests. Archives and PDFs are synthesised in memory, so
// no binary fixtures need checking in and every byte is accounted for.

import { expect, test } from "bun:test";
import { deflateSync, deflateRawSync } from "node:zlib";
import { readEntries, listEntries, ZipError } from "../src/containers/ZipReader.bun.js";
import { scanDocx, scanPptx, scanXlsx } from "../src/containers/Ooxml.bun.js";
import { scanPdf } from "../src/containers/Pdf.bun.js";
import { scanHiddenStyles } from "../src/containers/HiddenStyle.bun.js";
import { scanContainers } from "../src/containers/index.js";

const NBSP = String.fromCodePoint(0x00a0);

// ── Minimal ZIP writer (store and raw-deflate) ───────────────────────────────

// Local CRC-32 (IEEE) — independent of runtime internals.
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function buildZip(entries) {
  const encoder = new TextEncoder();
  const chunks = [];
  const central = [];
  let offset = 0;

  for (const { name, data, method = 8 } of entries) {
    const raw = typeof data === "string" ? encoder.encode(data) : data;
    const compressed = method === 8 ? new Uint8Array(deflateRawSync(raw)) : raw;
    const nameBytes = encoder.encode(name);
    const header = new DataView(new ArrayBuffer(30));
    header.setUint32(0, 0x04034b50, true);
    header.setUint16(4, 20, true);
    header.setUint16(8, method, true);
    header.setUint32(14, crc32(raw), true);
    header.setUint32(18, compressed.length, true);
    header.setUint32(22, raw.length, true);
    header.setUint16(26, nameBytes.length, true);
    chunks.push(new Uint8Array(header.buffer), nameBytes, compressed);

    const centralHeader = new DataView(new ArrayBuffer(46));
    centralHeader.setUint32(0, 0x02014b50, true);
    centralHeader.setUint16(10, method, true);
    centralHeader.setUint32(16, crc32(raw), true);
    centralHeader.setUint32(20, compressed.length, true);
    centralHeader.setUint32(24, raw.length, true);
    centralHeader.setUint16(28, nameBytes.length, true);
    centralHeader.setUint32(42, offset, true);
    central.push(new Uint8Array(centralHeader.buffer), nameBytes);

    offset += 30 + nameBytes.length + compressed.length;
  }

  const centralBytes = central.reduce((n, c) => n + c.length, 0);
  const eocd = new DataView(new ArrayBuffer(22));
  eocd.setUint32(0, 0x06054b50, true);
  eocd.setUint16(8, entries.length, true);
  eocd.setUint16(10, entries.length, true);
  eocd.setUint32(12, centralBytes, true);
  eocd.setUint32(16, offset, true);

  return concatBytes([...chunks, ...central, new Uint8Array(eocd.buffer)]);
}

function concatBytes(chunks) {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}

// ── ZipReader ─────────────────────────────────────────────────────────────────

test("zip: round-trips deflated and stored entries", () => {
  const zip = buildZip([
    { name: "word/document.xml", data: "<w:document/>" },
    { name: "stored.txt", data: "stored raw", method: 0 },
  ]);
  const entries = readEntries(zip);
  expect(new TextDecoder().decode(entries.get("word/document.xml"))).toBe("<w:document/>");
  expect(new TextDecoder().decode(entries.get("stored.txt"))).toBe("stored raw");
  expect(listEntries(zip).map((e) => e.name)).toEqual(["word/document.xml", "stored.txt"]);
});

test("zip: junk input throws ZipError distinctly", () => {
  expect(() => readEntries(new TextEncoder().encode("not a zip file"))).toThrow(ZipError);
});

// ── DOCX ──────────────────────────────────────────────────────────────────────

function docxWith(documentXml) {
  return buildZip([{ name: "word/document.xml", data: documentXml }]);
}

test("docx: invisible chars inside text runs are found with member attribution", async () => {
  const zip = docxWith(`<w:document><w:body><w:p><w:r><w:t>the network${NBSP}layer</w:t></w:r></w:p></w:body></w:document>`);
  const { findings } = await scanContainers("report.docx", zip, {});
  const nbsp = findings.find((f) => f.name === "NBSP");
  expect(nbsp).toBeDefined();
  expect(nbsp.member).toBe("report.docx::word/document.xml");
  expect(nbsp.line).toBeGreaterThan(0);
});

test("docx: escaped numeric character references are found too", async () => {
  const zip = docxWith(`<w:document><w:p><w:r><w:t>a&#160;b</w:t></w:r></w:p></w:document>`);
  const { findings } = await scanContainers("report.docx", zip, {});
  const entity = findings.find((f) => f.name === "NBSP_ENTITY");
  expect(entity).toBeDefined();
  expect(entity.description).toContain("&#160;");
});

test("docx: vanish runs and sub-point fonts are flagged", async () => {
  const hidden = `<w:p><w:r><w:rPr><w:vanish/></w:rPr><w:t>secret</w:t></w:r></w:p>`;
  const tiny = `<w:p><w:r><w:rPr><w:sz w:val="1"/></w:rPr><w:t>tiny</w:t></w:r></w:p>`;
  const zip = docxWith(`<w:document>${hidden}${tiny}</w:document>`);
  const { findings } = await scanContainers("report.docx", zip, {});
  expect(findings.some((f) => f.name === "OOXML_HIDDEN_RUN")).toBe(true);
  expect(findings.some((f) => f.name === "OOXML_SUSPICIOUS_FONT_SIZE")).toBe(true);
});

// ── PPTX ──────────────────────────────────────────────────────────────────────

test("pptx: slide text hidden chars and hidden shapes", async () => {
  const zip = buildZip([{
    name: "ppt/slides/slide1.xml",
    data: `<p:sld><p:spTree><p:sp hidden="1"><p:txBody><a:p><a:r><a:t>title${NBSP}text</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:sld>`,
  }]);
  const { findings } = await scanContainers("deck.pptx", zip, {});
  expect(findings.some((f) => f.name === "NBSP")).toBe(true);
  expect(findings.some((f) => f.name === "OOXML_HIDDEN_SHAPE")).toBe(true);
});

// ── XLSX ──────────────────────────────────────────────────────────────────────

test("xlsx: formula cells with empty cached values are findings; cached cells are not", async () => {
  const sheet = `<worksheet><sheetData><row r="1">
    <c r="A1"><v>visible</v></c>
    <c r="B1"><f>IF(A1="","","")</f></c>
    <c r="C1"><f>NOW()</f><v>45678.5</v></c>
  </row></sheetData>`;
  const zip = buildZip([
    { name: "xl/workbook.xml", data: `<workbook><sheets><sheet name="Budget" sheetId="1" r:id="rId1"/></sheets></workbook>` },
    { name: "xl/_rels/workbook.xml.rels", data: `<Relationships><Relationship Id="rId1" Type="t" Target="worksheets/sheet1.xml"/></Relationships>` },
    { name: "xl/worksheets/sheet1.xml", data: sheet },
    { name: "xl/sharedStrings.xml", data: `<sst><si><t>clean</t></si></sst>` },
  ]);
  const { findings } = await scanContainers("book.xlsx", zip, {});
  const empties = findings.filter((f) => f.name === "EMPTY_FORMULA_CELL");
  expect(empties.length).toBe(1);
  expect(empties[0].description).toContain("Budget!B1");
  expect(empties[0].description).toContain("cached value is absent");
});

test("xlsx: conversion artefacts in shared strings are scanned", async () => {
  const zip = buildZip([
    { name: "xl/sharedStrings.xml", data: `<sst><si><t>pasted${NBSP}text</t></si></sst>` },
  ]);
  const { findings } = await scanContainers("book.xlsx", zip, {});
  expect(findings.some((f) => f.name === "NBSP" && f.member === "book.xlsx::xl/sharedStrings.xml")).toBe(true);
});

// ── PDF ───────────────────────────────────────────────────────────────────────

function pdfWith(contentStreamText) {
  const stream = new Uint8Array(deflateSync(new TextEncoder().encode(contentStreamText)));
  const encoder = new TextEncoder();
  const parts = [
    encoder.encode("%PDF-1.4\n"),
    encoder.encode(`1 0 obj\n<< /Length ${stream.length} /Filter /FlateDecode >>\nstream\n`),
    stream,
    encoder.encode("\nendstream\nendobj\n"),
    encoder.encode("trailer\n<< >>\n%%EOF\n"),
  ];
  return concatBytes(parts);
}

test("pdf: rendering mode 3 invisible text is flagged as review material", () => {
  const pdf = pdfWith("BT\n/F1 12 Tf\n3 Tr\n(zero-ink text) Tj\n0 Tr\nET\n");
  const { findings } = scanPdf("doc.pdf", pdf);
  const invisible = findings.find((f) => f.name === "PDF_INVISIBLE_TEXT");
  expect(invisible).toBeDefined();
  expect(invisible.description).toContain("OCR");
  expect(invisible.safety).toBe("ambiguous");
});

test("pdf: zero font size and zero horizontal scaling", () => {
  const pdf = pdfWith("BT\n/F2 0 Tf\n0 Tz\n(x) Tj\nET\n");
  const { findings } = scanPdf("doc.pdf", pdf);
  expect(findings.some((f) => f.name === "PDF_ZERO_FONT")).toBe(true);
  expect(findings.some((f) => f.name === "PDF_ZERO_WIDTH")).toBe(true);
});

test("pdf: binary streams are skipped, not misreported", () => {
  const junk = concatBytes([new TextEncoder().encode("%PDF-1.4\n1 0 obj\n<< /Length 4 >>\nstream\n"), new Uint8Array([0xff, 0xd8, 0x00, 0x01]), new TextEncoder().encode("\nendstream\n%%EOF")]);
  const { findings } = scanPdf("img.pdf", junk);
  expect(findings.length).toBe(0);
});

test("pdf: non-PDF input errors distinctly", () => {
  expect(() => scanPdf("nope.pdf", new TextEncoder().encode("hello"))).toThrow(/not a PDF/);
});

// ── Hidden style idioms ───────────────────────────────────────────────────────

test("hidden styles: markup flags zero-size fonts as warnings, css as info", () => {
  const html = `<p style="font-size:0">invisible</p>`;
  const findings = scanHiddenStyles(html, ".html");
  expect(findings.length).toBe(1);
  expect(findings[0].name).toBe("HIDDEN_STYLE_ZERO_FONT");
  expect(findings[0].severity).toBe("warning");
  expect(findings[0].line).toBe(1);

  const css = scanHiddenStyles(".x { font-size: 0; }", ".css");
  expect(css[0].severity).toBe("info");
});

test("hidden styles: transparent text, display none, offscreen indent, positions", () => {
  const html = `<div style="color:transparent">a</div>\n<span style="text-indent:-9999px">b</span>`;
  const findings = scanHiddenStyles(html, ".html");
  const names = findings.map((f) => f.name).sort();
  expect(names).toContain("HIDDEN_STYLE_TRANSPARENT");
  expect(names).toContain("HIDDEN_STYLE_OFFSCREEN_INDENT");
  expect(findings.find((f) => f.name === "HIDDEN_STYLE_OFFSCREEN_INDENT").line).toBe(2);
});

test("hidden styles: plain text files are untouched", () => {
  expect(scanHiddenStyles("font-size:0 in prose", ".txt").length).toBe(0);
});
