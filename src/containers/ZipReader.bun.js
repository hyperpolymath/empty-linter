// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Jonathan D.A. Jewell
//
// ZipReader.bun.js — dependency-free ZIP archive reading for OOXML containers
// (.docx/.pptx/.xlsx are all ZIP packages). Read-only: nothing in the archive
// is modified, extracted to disk, or trusted implicitly — entry names are
// treated as data, sizes are bounds-checked against the buffer.

import { inflateRawSync } from "node:zlib";

export class ZipError extends Error {}

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const MAX_ENTRIES = 10_000;
const MAX_MEMBER_BYTES = 128 * 1024 * 1024;

/**
 * Read all entries of a ZIP archive into memory.
 * @param {Uint8Array} bytes
 * @returns {Map<string, Uint8Array>} entry name → decompressed content
 * @throws {ZipError}
 */
export function readEntries(bytes) {
  const entries = listEntries(bytes);
  const out = new Map();
  for (const entry of entries) {
    out.set(entry.name, inflateEntry(bytes, entry));
  }
  return out;
}

/**
 * List central-directory entries with offsets/sizes (no inflation).
 */
export function listEntries(bytes) {
  const eocdOffset = findEndOfCentralDirectory(bytes);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = view.getUint16(eocdOffset + 10, true);
  if (count > MAX_ENTRIES) throw new ZipError(`${count} entries exceeds safety limit ${MAX_ENTRIES}`);
  let offset = view.getUint32(eocdOffset + 16, true);

  const entries = [];
  for (let i = 0; i < count; i += 1) {
    if (offset + 46 > bytes.length) throw new ZipError("truncated central directory");
    if (view.getUint32(offset, true) !== CENTRAL_SIGNATURE) throw new ZipError("bad central directory signature");
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const uncompressedSize = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localHeaderOffset = view.getUint32(offset + 42, true);
    const nameBytes = bytes.subarray(offset + 46, offset + 46 + nameLength);
    const name = new TextDecoder("utf-8", { fatal: false }).decode(nameBytes);
    if (uncompressedSize > MAX_MEMBER_BYTES) {
      throw new ZipError(`entry ${name} claims ${uncompressedSize} bytes (zip-bomb guard)`);
    }
    entries.push({ name, method, compressedSize, uncompressedSize, localHeaderOffset });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function inflateEntry(bytes, entry) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const base = entry.localHeaderOffset;
  if (base + 30 > bytes.length) throw new ZipError(`truncated local header for ${entry.name}`);
  if (view.getUint32(base, true) !== LOCAL_SIGNATURE) throw new ZipError(`bad local header for ${entry.name}`);
  const nameLength = view.getUint16(base + 26, true);
  const extraLength = view.getUint16(base + 28, true);
  const dataStart = base + 30 + nameLength + extraLength;
  const dataEnd = dataStart + entry.compressedSize;
  if (dataEnd > bytes.length) throw new ZipError(`truncated data for ${entry.name}`);
  const compressed = bytes.subarray(dataStart, dataEnd);

  if (entry.method === 0) return new Uint8Array(compressed);
  if (entry.method === 8) {
    try {
      return new Uint8Array(inflateRawSync(compressed));
    } catch (error) {
      throw new ZipError(`cannot inflate ${entry.name}: ${error.message}`);
    }
  }
  throw new ZipError(`unsupported compression method ${entry.method} for ${entry.name}`);
}

function findEndOfCentralDirectory(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const minimum = 22;
  // EOCD can be followed by up to 65535 bytes of archive comment.
  const searchStart = Math.max(0, bytes.length - minimum - 0xffff);
  for (let offset = bytes.length - minimum; offset >= searchStart; offset -= 1) {
    if (view.getUint32(offset, true) === EOCD_SIGNATURE) {
      const commentLength = view.getUint16(offset + 20, true);
      if (offset + minimum + commentLength === bytes.length) return offset;
    }
  }
  throw new ZipError("no end-of-central-directory record found (not a ZIP archive?)");
}
