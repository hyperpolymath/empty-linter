// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Jonathan D.A. Jewell
//
// keys.bun.js — decode raw terminal byte sequences into key events.
// Pure function over a buffer: the IO shell feeds it stdin chunks.

/**
 * @param {Uint8Array} chunk raw bytes just read from stdin
 * @returns {Array<{name: string, printable?: boolean, char?: string}>}
 */
export function decodeKeys(chunk) {
  const keys = [];
  let i = 0;
  const bytes = chunk;

  const takeEscape = () => {
    // ESC [ … sequences.
    if (bytes[i + 1] === 0x5b) { // '['
      const third = bytes[i + 2];
      const simple = { 0x41: "up", 0x42: "down", 0x43: "right", 0x44: "left", 0x48: "home", 0x46: "end" };
      if (simple[third] !== undefined) {
        i += 3;
        return simple[third];
      }
      if (third === 0x35 || third === 0x36) { // '5~'=PgUp '6~'=PgDn
        i += 4; // skip digit + '~'
        return third === 0x35 ? "pageup" : "pagedown";
      }
      if (third === 0x33) { i += 4; return "delete"; }
      i += 2;
      return "esc";
    }
    i += 1;
    return "esc";
  };

  while (i < bytes.length) {
    const b = bytes[i];
    if (b === 0x1b) {
      keys.push({ name: takeEscape() });
    } else if (b === 0x03) {
      keys.push({ name: "ctrl-c" });
      i += 1;
    } else if (b === 0x0d || b === 0x0a) {
      keys.push({ name: "enter" });
      i += 1;
    } else if (b === 0x7f || b === 0x08) {
      keys.push({ name: "backspace" });
      i += 1;
    } else if (b < 0x20) {
      i += 1; // other controls ignored
    } else {
      // Decode one UTF-8 scalar.
      const length = b < 0x80 ? 1 : b < 0xe0 ? 2 : b < 0xf0 ? 3 : 4;
      const char = new TextDecoder("utf-8", { fatal: false }).decode(bytes.subarray(i, i + length));
      i += length;
      const name = char.length === 1 && /[\x20-\x7e]/u.test(char) ? char : "char";
      keys.push({ name: name === " " ? "space" : name, printable: true, char });
    }
  }
  return keys;
}
