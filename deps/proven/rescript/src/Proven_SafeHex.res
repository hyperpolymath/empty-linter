// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2025 Hyperpolymath

/**
 * SafeHex - Hexadecimal encoding/decoding that cannot crash.
 *
 * Provides safe hex operations with constant-time comparison for security-sensitive use.
 */

/** Error types for hex operations */
type hexError =
  | InvalidLength
  | InvalidCharacter
  | EmptyInput

/** Hex character set (lowercase) */
let hexChars = "0123456789abcdef"

/** Hex character set (uppercase) */
let hexCharsUpper = "0123456789ABCDEF"

/** Convert a single hex character to its integer value */
let hexCharToInt = (char: string): option<int> => {
  let code = Js.String2.charCodeAt(char, 0)->Belt.Float.toInt
  if code >= 48 && code <= 57 {
    // 0-9
    Some(code - 48)
  } else if code >= 65 && code <= 70 {
    // A-F
    Some(code - 55)
  } else if code >= 97 && code <= 102 {
    // a-f
    Some(code - 87)
  } else {
    None
  }
}

/** Convert an integer (0-15) to a hex character (lowercase) */
let intToHexChar = (value: int): option<string> => {
  if value >= 0 && value <= 15 {
    Some(Js.String2.charAt(hexChars, value))
  } else {
    None
  }
}

/** Encode a byte array to a hex string (lowercase) */
let encode = (bytes: array<int>): result<string, hexError> => {
  if Belt.Array.length(bytes) == 0 {
    Ok("")
  } else {
    let result = ref("")
    let valid = ref(true)

    Belt.Array.forEach(bytes, byte => {
      if valid.contents && byte >= 0 && byte <= 255 {
        let high = lsr(byte, 4)
        let low = land(byte, 0x0f)
        result :=
          result.contents ++
          Js.String2.charAt(hexChars, high) ++
          Js.String2.charAt(hexChars, low)
      } else {
        valid := false
      }
    })

    if valid.contents {
      Ok(result.contents)
    } else {
      Error(InvalidCharacter)
    }
  }
}

/** Encode a byte array to a hex string (uppercase) */
let encodeUppercase = (bytes: array<int>): result<string, hexError> => {
  if Belt.Array.length(bytes) == 0 {
    Ok("")
  } else {
    let result = ref("")
    let valid = ref(true)

    Belt.Array.forEach(bytes, byte => {
      if valid.contents && byte >= 0 && byte <= 255 {
        let high = lsr(byte, 4)
        let low = land(byte, 0x0f)
        result :=
          result.contents ++
          Js.String2.charAt(hexCharsUpper, high) ++
          Js.String2.charAt(hexCharsUpper, low)
      } else {
        valid := false
      }
    })

    if valid.contents {
      Ok(result.contents)
    } else {
      Error(InvalidCharacter)
    }
  }
}

/** Encode a string to hex (using UTF-8 code points) */
let encodeString = (input: string): string => {
  let result = ref("")
  for i in 0 to Js.String2.length(input) - 1 {
    let code = Js.String2.charCodeAt(input, i)->Belt.Float.toInt
    // Handle basic ASCII range (0-255)
    if code <= 255 {
      let high = lsr(code, 4)
      let low = land(code, 0x0f)
      result :=
        result.contents ++ Js.String2.charAt(hexChars, high) ++ Js.String2.charAt(hexChars, low)
    } else {
      // For characters > 255, encode as multi-byte
      // High byte
      let highByte = lsr(code, 8)
      let highHigh = lsr(highByte, 4)
      let highLow = land(highByte, 0x0f)
      result :=
        result.contents ++
        Js.String2.charAt(hexChars, highHigh) ++
        Js.String2.charAt(hexChars, highLow)
      // Low byte
      let lowByte = land(code, 0xff)
      let lowHigh = lsr(lowByte, 4)
      let lowLow = land(lowByte, 0x0f)
      result :=
        result.contents ++
        Js.String2.charAt(hexChars, lowHigh) ++
        Js.String2.charAt(hexChars, lowLow)
    }
  }
  result.contents
}

/** Decode a hex string to a byte array */
let decode = (hexStr: string): result<array<int>, hexError> => {
  let normalized = Js.String2.toLowerCase(Js.String2.trim(hexStr))
  let length = Js.String2.length(normalized)

  if length == 0 {
    Ok([])
  } else if mod(length, 2) != 0 {
    Error(InvalidLength)
  } else {
    let numBytes = length / 2
    let bytes = Belt.Array.make(numBytes, 0)
    let valid = ref(true)
    let errorType = ref(InvalidCharacter)

    for i in 0 to numBytes - 1 {
      if valid.contents {
        let highChar = Js.String2.charAt(normalized, i * 2)
        let lowChar = Js.String2.charAt(normalized, i * 2 + 1)
        switch (hexCharToInt(highChar), hexCharToInt(lowChar)) {
        | (Some(high), Some(low)) =>
          Belt.Array.setUnsafe(bytes, i, lsl(high, 4) + low)
        | _ =>
          valid := false
          errorType := InvalidCharacter
        }
      }
    }

    if valid.contents {
      Ok(bytes)
    } else {
      Error(errorType.contents)
    }
  }
}

/** Decode a hex string to a string (ASCII range only) */
let decodeToString = (hexStr: string): result<string, hexError> => {
  switch decode(hexStr) {
  | Error(e) => Error(e)
  | Ok(bytes) =>
    let result = ref("")
    Belt.Array.forEach(bytes, byte => {
      result := result.contents ++ Js.String2.fromCharCode(byte)
    })
    Ok(result.contents)
  }
}

/** Check if a string is valid hex */
let isValidHex = (hexStr: string): bool => {
  let trimmed = Js.String2.trim(hexStr)
  let length = Js.String2.length(trimmed)

  if length == 0 || mod(length, 2) != 0 {
    false
  } else {
    Js.Re.test_(%re("/^[0-9a-fA-F]+$/"), trimmed)
  }
}

/** Constant-time comparison of two hex strings
 *
 * SECURITY: This function compares strings in constant time to prevent
 * timing attacks. It always examines the full length of both strings
 * regardless of where differences occur.
 */
let constantTimeEqual = (hexA: string, hexB: string): bool => {
  let normalizedA = Js.String2.toLowerCase(Js.String2.trim(hexA))
  let normalizedB = Js.String2.toLowerCase(Js.String2.trim(hexB))

  let lengthA = Js.String2.length(normalizedA)
  let lengthB = Js.String2.length(normalizedB)

  // Length comparison must not short-circuit
  let lengthMatch = lengthA == lengthB

  // Use the longer length to ensure constant time
  let maxLength = if lengthA > lengthB {
    lengthA
  } else {
    lengthB
  }

  // Accumulate differences using XOR
  let diff = ref(0)

  for i in 0 to maxLength - 1 {
    let charA = if i < lengthA {
      Js.String2.charCodeAt(normalizedA, i)->Belt.Float.toInt
    } else {
      0
    }
    let charB = if i < lengthB {
      Js.String2.charCodeAt(normalizedB, i)->Belt.Float.toInt
    } else {
      0
    }
    diff := lor(diff.contents, lxor(charA, charB))
  }

  lengthMatch && diff.contents == 0
}

/** Constant-time comparison of two byte arrays
 *
 * SECURITY: This function compares byte arrays in constant time.
 */
let constantTimeEqualBytes = (bytesA: array<int>, bytesB: array<int>): bool => {
  let lengthA = Belt.Array.length(bytesA)
  let lengthB = Belt.Array.length(bytesB)

  let lengthMatch = lengthA == lengthB

  let maxLength = if lengthA > lengthB {
    lengthA
  } else {
    lengthB
  }

  let diff = ref(0)

  for i in 0 to maxLength - 1 {
    let byteA = if i < lengthA {
      Belt.Array.getUnsafe(bytesA, i)
    } else {
      0
    }
    let byteB = if i < lengthB {
      Belt.Array.getUnsafe(bytesB, i)
    } else {
      0
    }
    diff := lor(diff.contents, lxor(byteA, byteB))
  }

  lengthMatch && diff.contents == 0
}

/** Convert a hex string to lowercase */
let toLowercase = (hexStr: string): result<string, hexError> => {
  if !isValidHex(hexStr) && Js.String2.length(Js.String2.trim(hexStr)) > 0 {
    Error(InvalidCharacter)
  } else {
    Ok(Js.String2.toLowerCase(Js.String2.trim(hexStr)))
  }
}

/** Convert a hex string to uppercase */
let toUppercase = (hexStr: string): result<string, hexError> => {
  if !isValidHex(hexStr) && Js.String2.length(Js.String2.trim(hexStr)) > 0 {
    Error(InvalidCharacter)
  } else {
    Ok(Js.String2.toUpperCase(Js.String2.trim(hexStr)))
  }
}

/** Get the byte length of a hex string (hex length / 2) */
let byteLength = (hexStr: string): result<int, hexError> => {
  let trimmed = Js.String2.trim(hexStr)
  let length = Js.String2.length(trimmed)

  if length == 0 {
    Ok(0)
  } else if mod(length, 2) != 0 {
    Error(InvalidLength)
  } else if !isValidHex(trimmed) {
    Error(InvalidCharacter)
  } else {
    Ok(length / 2)
  }
}

/** XOR two hex strings of equal length */
let xorHex = (hexA: string, hexB: string): result<string, hexError> => {
  switch (decode(hexA), decode(hexB)) {
  | (Error(e), _) | (_, Error(e)) => Error(e)
  | (Ok(bytesA), Ok(bytesB)) =>
    if Belt.Array.length(bytesA) != Belt.Array.length(bytesB) {
      Error(InvalidLength)
    } else {
      let result = Belt.Array.mapWithIndex(bytesA, (i, byteA) => {
        let byteB = Belt.Array.getUnsafe(bytesB, i)
        lxor(byteA, byteB)
      })
      encode(result)
    }
  }
}
