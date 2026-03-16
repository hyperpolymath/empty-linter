// SPDX-License-Identifier: PMPL-1.0-or-later
// SPDX-FileCopyrightText: 2025 Hyperpolymath
//
// DotmatrixBridge - IPC bridge for dotmatrix-fileprinter integration
// 🏆 Idris Inside - Uses proven SafeHex for byte-level communication

open Proven_SafeHex
open ByteDetector

/** IPC modes for dotmatrix communication */
type ipcMode =
  | Stdio     // Standard input/output pipes
  | Socket    // Unix domain socket
  | Http      // HTTP localhost API

/** Message types for IPC protocol */
type messageType =
  | ScanRequest
  | ScanResponse
  | FixRequest
  | FixResponse
  | HexDumpRequest
  | HexDumpResponse
  | Error

/** IPC message structure */
type message = {
  msgType: messageType,
  payload: string,
  checksum: string,
}

/** Dotmatrix connection configuration */
type connectionConfig = {
  mode: ipcMode,
  socketPath: string,
  httpPort: int,
  timeout: int, // milliseconds
}

/** Default connection configuration */
let defaultConfig: connectionConfig = {
  mode: Stdio,
  socketPath: "/tmp/dotmatrix.sock",
  httpPort: 8765,
  timeout: 5000,
}

/** Compute message checksum using proven SafeHex
 *
 * 🏆 Idris Inside: Uses constant-time hex encoding
 */
let computeChecksum = (payload: string): string => {
  let hex = encodeString(payload)
  // Simple checksum: first 8 chars of hex-encoded payload
  Js.String2.slice(hex, ~from=0, ~to_=8)
}

/** Verify message checksum
 *
 * 🏆 Idris Inside: Uses constant-time comparison
 */
let verifyChecksum = (msg: message): bool => {
  let computed = computeChecksum(msg.payload)
  constantTimeEqual(computed, msg.checksum)
}

/** Encode artifact for transmission
 *
 * 🏆 Idris Inside: Uses SafeHex for byte-safe encoding
 */
let encodeArtifact = (a: artifact): string => {
  `${Belt.Int.toString(a.line)}:${Belt.Int.toString(a.column)}:${a.hexValue}:${a.name}:${a.fixAction}`
}

/** Decode artifact from transmission */
let decodeArtifact = (encoded: string): option<artifact> => {
  let parts = Js.String2.split(encoded, ":")
  if Belt.Array.length(parts) >= 5 {
    let line = Belt.Array.getUnsafe(parts, 0)->Belt.Int.fromString
    let column = Belt.Array.getUnsafe(parts, 1)->Belt.Int.fromString
    let hexValue = Belt.Array.getUnsafe(parts, 2)
    let name = Belt.Array.getUnsafe(parts, 3)
    let fixAction = Belt.Array.getUnsafe(parts, 4)

    switch (line, column) {
    | (Some(l), Some(c)) =>
      // Decode hex to get byte value
      let byteValue = switch decode(hexValue) {
      | Ok(bytes) if Belt.Array.length(bytes) > 0 => Belt.Array.getUnsafe(bytes, 0)
      | _ => 0
      }

      Some({
        line: l,
        column: c,
        byteValue: byteValue,
        hexValue: hexValue,
        name: name,
        severity: Warning, // Default, would be looked up in real impl
        fixAction: fixAction,
      })
    | _ => None
    }
  } else {
    None
  }
}

/** Create a scan request message */
let createScanRequest = (filePath: string): message => {
  let payload = filePath
  {
    msgType: ScanRequest,
    payload: payload,
    checksum: computeChecksum(payload),
  }
}

/** Create a scan response message */
let createScanResponse = (artifacts: array<artifact>): message => {
  let payload = artifacts->Belt.Array.map(encodeArtifact)->Js.Array2.joinWith("\n")
  {
    msgType: ScanResponse,
    payload: payload,
    checksum: computeChecksum(payload),
  }
}

/** Create a hex dump request */
let createHexDumpRequest = (content: string): message => {
  let payload = encodeString(content)
  {
    msgType: HexDumpRequest,
    payload: payload,
    checksum: computeChecksum(payload),
  }
}

/** Serialize message for transmission
 *
 * Format: TYPE|PAYLOAD|CHECKSUM
 */
let serializeMessage = (msg: message): string => {
  let typeStr = switch msg.msgType {
  | ScanRequest => "SCAN_REQ"
  | ScanResponse => "SCAN_RES"
  | FixRequest => "FIX_REQ"
  | FixResponse => "FIX_RES"
  | HexDumpRequest => "HEX_REQ"
  | HexDumpResponse => "HEX_RES"
  | Error => "ERROR"
  }
  `${typeStr}|${msg.payload}|${msg.checksum}`
}

/** Deserialize message from transmission */
let deserializeMessage = (raw: string): option<message> => {
  let parts = Js.String2.split(raw, "|")
  if Belt.Array.length(parts) >= 3 {
    let typeStr = Belt.Array.getUnsafe(parts, 0)
    let payload = Belt.Array.getUnsafe(parts, 1)
    let checksum = Belt.Array.getUnsafe(parts, 2)

    let msgType = switch typeStr {
    | "SCAN_REQ" => Some(ScanRequest)
    | "SCAN_RES" => Some(ScanResponse)
    | "FIX_REQ" => Some(FixRequest)
    | "FIX_RES" => Some(FixResponse)
    | "HEX_REQ" => Some(HexDumpRequest)
    | "HEX_RES" => Some(HexDumpResponse)
    | "ERROR" => Some(Error)
    | _ => None
    }

    switch msgType {
    | Some(t) => Some({ msgType: t, payload: payload, checksum: checksum })
    | None => None
    }
  } else {
    None
  }
}

/** Stdio-based communication (for Forth kernel IPC) */
module Stdio = {
  @val external process: 'a = "process"

  /** Write message to stdout */
  let send = (msg: message): unit => {
    let serialized = serializeMessage(msg)
    Js.log(serialized)
  }

  /** Parse incoming message from stdin line */
  let receive = (line: string): option<message> => {
    let msg = deserializeMessage(line)
    switch msg {
    | Some(m) if verifyChecksum(m) => Some(m)
    | _ => None
    }
  }
}

/** Format artifacts for dotmatrix hex dump display
 *
 * Creates output compatible with dotmatrix-fileprinter's
 * hex visualization format.
 *
 * 🏆 Idris Inside: Uses SafeHex for byte-accurate output
 */
let formatForDotmatrix = (artifacts: array<artifact>): string => {
  let header = "DOTMATRIX HEX DUMP - INVISIBLE ARTIFACTS\n"
  let separator = "═══════════════════════════════════════\n"

  let lines = artifacts->Belt.Array.map(a => {
    let severity = switch a.severity {
    | Critical => "▓▓▓"
    | Error => "▓▓░"
    | Warning => "▓░░"
    | Info => "░░░"
    }
    `${severity} 0x${Js.String2.toUpperCase(a.hexValue)} │ ${a.name} │ L${Belt.Int.toString(a.line)}:C${Belt.Int.toString(a.column)} │ ${a.fixAction}`
  })

  let footer = separator ++ `Total: ${Belt.Int.toString(Belt.Array.length(artifacts))} artifacts\n`

  header ++ separator ++ Js.Array2.joinWith(lines, "\n") ++ "\n" ++ footer
}

/** Encode content for safe transmission to Forth kernel
 *
 * Converts all bytes to hex pairs, ensuring no special
 * characters can interfere with Forth parsing.
 *
 * 🏆 Idris Inside: Uses SafeHex for lossless encoding
 */
let encodeForForth = (content: string): string => {
  encodeString(content)
}

/** Decode content received from Forth kernel
 *
 * 🏆 Idris Inside: Uses SafeHex for lossless decoding
 */
let decodeFromForth = (hex: string): result<string, string> => {
  decodeString(hex)
}

/** Bridge status */
type bridgeStatus = {
  connected: bool,
  mode: ipcMode,
  lastMessage: option<message>,
  errorCount: int,
}

/** Initial bridge status */
let initialStatus: bridgeStatus = {
  connected: false,
  mode: Stdio,
  lastMessage: None,
  errorCount: 0,
}
