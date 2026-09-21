// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Jonathan D.A. Jewell
//
// Pdf.bun.js — PDF "negative space" detectors.
//
// Detects the three classic invisible-text idioms inside PDF content streams:
//
//   Tr 3      text rendering mode 3 — glyphs are laid out but never painted
//             (legitimate for OCR text layers; a classic hidden-text channel
//             elsewhere, so it is reported as ambiguous review material);
//   0 Tf      zero font size — text exists at zero visible size;
//   0 Tz      zero horizontal scaling — text exists at zero visible width.
//
// Streams are only inspected when they flate-decode to something that parses
// as UTF-8 operator text; binary streams (images, fonts) are skipped.
// The document is never modified.

import { inflateSync } from "node:zlib";
import { locate } from "./HiddenStyle.bun.js";

const MAX_STREAM_BYTES = 64 * 1024 * 1024;
const DECODER = new TextDecoder("utf-8", { fatal: true });

export class PdfError extends Error {}

/**
 * @param {string} path PDF path (for finding attribution)
 * @param {Uint8Array} bytes whole PDF
 * @returns {{findings: object[], scannedScalars: number}}
 */
export function scanPdf(path, bytes) {
  if (!startsWithPdfMagic(bytes)) {
    throw new PdfError("not a PDF document (missing %PDF- header)");
  }
  const findings = [];
  let scannedScalars = 0;
  let streamIndex = 0;

  for (const stream of extractStreams(bytes)) {
    streamIndex += 1;
    let text;
    try {
      text = DECODER.decode(stream.data);
    } catch {
      continue; // binary stream (image/font/program): not inspectable as text
    }
    scannedScalars += [...text].length;
    findings.push(...inspectContentStream(`${path}::stream#${streamIndex}`, text, streamIndex));
  }
  return { findings, scannedScalars };
}

function startsWithPdfMagic(bytes) {
  return bytes.length >= 5 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d;
}

/**
 * Extract stream bodies, inflating /FlateDecode streams. Non-inflatable or
 * unfiltered streams are returned raw; completely broken streams are skipped.
 */
export function extractStreams(bytes) {
  const streams = [];
  const source = latin1(bytes);
  let searchFrom = 0;

  for (;;) {
    const streamKeyword = source.indexOf("stream", searchFrom);
    if (streamKeyword === -1) return streams;
    // Data starts after the keyword, "\r\n" or "\n".
    let dataStart = streamKeyword + 6;
    if (source[dataStart] === "\r" && source[dataStart + 1] === "\n") dataStart += 2;
    else if (source[dataStart] === "\n" || source[dataStart] === "\r") dataStart += 1;

    const endKeyword = source.indexOf("endstream", dataStart);
    if (endKeyword === -1) return streams;
    // Trim the single preceding EOL before endstream.
    let dataEnd = endKeyword;
    if (source[dataEnd - 1] === "\n") dataEnd -= 1;
    else if (source[dataEnd - 1] === "\r" && source[dataEnd - 2] === "\n") dataEnd -= 2;
    if (dataEnd < dataStart) dataEnd = dataStart;

    const dictWindow = source.slice(Math.max(0, streamKeyword - 2000), streamKeyword);
    const flated = /\/FlateDecode/u.test(dictWindow);
    if (dictWindow.includes(">>")) {
      // Only treat as a content candidate if a dictionary precedes the stream.
      const raw = bytes.subarray(dataStart, dataEnd);
      let data = raw;
      if (flated) {
        try {
          if (raw.length > 0 && raw.length <= MAX_STREAM_BYTES) {
            data = new Uint8Array(inflateSync(raw));
          }
        } catch {
          searchFrom = endKeyword + 9;
          continue; // undecodable stream: skip honestly
        }
      }
      streams.push({ data, flated });
    }
    searchFrom = endKeyword + 9;
  }
}

function inspectContentStream(member, text, streamIndex) {
  const findings = [];

  // Only operator text (content streams) is meaningful: require BT/ET blocks.
  if (!/\bBT\b/u.test(text) || !/\bET\b/u.test(text)) return findings;

  const report = (name, unicodeName, severity, description, offset) => {
    const { line, column, byteOffset } = locate(text, offset);
    findings.push({
      code_point: null,
      utf8_hex: null,
      name,
      unicode_name: unicodeName,
      category: "pdf",
      severity,
      safety: "ambiguous",
      fix: { kind: "review" },
      description,
      line,
      column,
      byte_offset: byteOffset,
      scalar_index: offset,
      context_escaped: undefined,
      member,
    });
  };

  const renderMode = /(^|\s)3\s+Tr\b/gu;
  let match;
  while ((match = renderMode.exec(text)) !== null) {
    report(
      "PDF_INVISIBLE_TEXT",
      "TEXT RENDERING MODE 3 (INVISIBLE)",
      "warning",
      `Text rendering mode 3 paints nothing: everything shown between here and the matching 0 Tr is invisible. ` +
      `Legitimate for OCR text layers; otherwise a classic hidden-text channel (stream #${streamIndex}). Review the text it covers.`,
      match.index + match[1].length,
    );
  }

  const zeroFont = /\/[\w.+#-]+\s+0(?:\.0+)?\s+Tf\b/gu;
  while ((match = zeroFont.exec(text)) !== null) {
    report(
      "PDF_ZERO_FONT",
      "ZERO-SIZE FONT SELECTION",
      "warning",
      "Font selected at size 0: subsequent text exists in the document at zero visible size.",
      match.index,
    );
  }

  const zeroScale = /(^|\s)-?0(?:\.0+)?\s+Tz\b/gu;
  while ((match = zeroScale.exec(text)) !== null) {
    report(
      "PDF_ZERO_WIDTH",
      "ZERO HORIZONTAL SCALING",
      "warning",
      "Horizontal text scaling of 0%: glyphs exist but render at zero width.",
      match.index + match[1].length,
    );
  }

  return findings;
}

function latin1(bytes) {
  // 1:1 byte→char decode for structural scanning of the PDF container.
  let out = "";
  const chunk = 8192;
  for (let i = 0; i < bytes.length; i += chunk) {
    out += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return out;
}
