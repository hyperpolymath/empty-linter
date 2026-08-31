// @bun
// build/ByteDetector.affine.esm.js
var Some = (value) => ({ tag: "Some", value });
var None = { tag: "None" };
var __as_concat = (a, b) => Array.isArray(a) ? a.concat(b) : a + b;
var __as_strSub = (s, start, n) => String(s).slice(start, start + n);
var __as_strGet = (s, i) => String(s)[i];
var __as_charToInt = (c) => String(c).codePointAt(0);
var __as_show = (v) => typeof v === "string" ? v : JSON.stringify(v);
function encode_byte(v) {
  const nibble_hi = v >> 4 & 15;
  const nibble_lo = v & 15;
  const hex = "0123456789abcdef";
  return __as_concat(__as_strSub(hex, nibble_hi, 1), __as_strSub(hex, nibble_lo, 1));
}
var Critical = { tag: "Critical" };
var SevError = { tag: "SevError" };
var Warning = { tag: "Warning" };
var Info = { tag: "Info" };
function known_artifacts() {
  return [{ name: "NULL", byte_value: 0, severity: Critical, fix_action: "remove" }, { name: "NBSP", byte_value: 160, severity: SevError, fix_action: "replace:20" }, { name: "ZWSP", byte_value: 8203, severity: SevError, fix_action: "remove" }, { name: "BOM", byte_value: 65279, severity: Warning, fix_action: "remove" }, { name: "SHY", byte_value: 173, severity: Info, fix_action: "remove" }, { name: "LRM", byte_value: 8206, severity: Info, fix_action: "remove" }, { name: "RLM", byte_value: 8207, severity: Info, fix_action: "remove" }, { name: "WJ", byte_value: 8288, severity: Info, fix_action: "remove" }, { name: "ZWNJ", byte_value: 8204, severity: Warning, fix_action: "keep" }, { name: "ZWJ", byte_value: 8205, severity: Warning, fix_action: "keep" }];
}
function get_artifact_def(byte_val) {
  if (byte_val >= 1 && byte_val <= 8 || byte_val === 11 || byte_val === 12 || byte_val >= 14 && byte_val <= 31) {
    return Some({ name: "C0_CONTROL", byte_value: byte_val, severity: Critical, fix_action: "review" });
  }
  if (byte_val === 127) {
    return Some({ name: "DELETE", byte_value: byte_val, severity: Critical, fix_action: "review" });
  }
  const defs = known_artifacts();
  for (const d of defs) {
    if (d.byte_value === byte_val) {
      return Some(d);
    }
  }
  return None;
}
function byte_to_hex(v) {
  return v <= 255 ? (() => {
    return encode_byte(v);
  })() : v <= 65535 ? (() => {
    return __as_concat(encode_byte(v >> 8 & 255), encode_byte(v & 255));
  })() : (() => {
    return __as_concat(__as_concat(encode_byte(v >> 16 & 255), encode_byte(v >> 8 & 255)), encode_byte(v & 255));
  })();
}
function scan(content) {
  let results = [];
  let line = 1;
  let col = 1;
  const n = content.length;
  let i = 0;
  while (i < n) {
    const c = __as_strGet(content, i);
    const code = __as_charToInt(c);
    if (code === 10) {
      line = line + 1;
      col = 1;
    } else {
      {
        const __scrut = get_artifact_def(code);
        if (__scrut.tag === "Some") {
          const def = __scrut.value;
          results = __as_concat(results, [{ line, column: col, byte_value: code, hex_value: byte_to_hex(code), name: def.name, severity: def.severity, fix_action: def.fix_action }]);
          col = col + 1;
        } else if (__scrut.tag === "None") {
          col = col + 1;
        } else
          throw new Error("non-exhaustive match");
      }
    }
    i = i + 1;
  }
  return results;
}
function scan_to_hex(content) {
  const artifacts = scan(content);
  let lines = "";
  let first = true;
  for (const a of artifacts) {
    if (!first) {
      lines = __as_concat(lines, `
`);
    }
    lines = __as_concat(__as_concat(__as_concat(__as_concat(__as_concat(__as_concat(__as_concat(__as_concat(lines, "0x"), String(a.hex_value).toUpperCase()), " ["), a.name), "] at L:"), String(a.line)), " C:"), String(a.column));
    first = false;
  }
  return lines;
}
function apply_fixes(content) {
  let result = content;
  let count = 0;
  const defs = known_artifacts();
  for (const def of defs) {
    if (def.fix_action === "remove") {
      const parts_count = result.length;
      const fixed = replace_char(result, def.byte_value, "");
      const new_count = fixed.length;
      count = count + (parts_count - new_count);
      result = fixed;
    } else {
      if (def.fix_action === "replace:20") {
        result = replace_char(result, def.byte_value, " ");
      }
    }
  }
  return [result, count];
}
function replace_char(s, target_code, replacement) {
  const n = s.length;
  let result = "";
  let i = 0;
  while (i < n) {
    const c = __as_strGet(s, i);
    const code = __as_charToInt(c);
    if (code === target_code) {
      result = __as_concat(result, replacement);
    } else {
      result = __as_concat(result, __as_show(c));
    }
    i = i + 1;
  }
  return result;
}
function severity_order(s) {
  return ((__scrut) => {
    if (__scrut.tag === "Critical") {
      return 4;
    }
    if (__scrut.tag === "SevError") {
      return 3;
    }
    if (__scrut.tag === "Warning") {
      return 2;
    }
    if (__scrut.tag === "Info") {
      return 1;
    }
    throw new Error("non-exhaustive match");
  })(s);
}
function filter_by_severity(artifacts, min_severity) {
  const min_order = severity_order(min_severity);
  let result = [];
  for (const a of artifacts) {
    if (severity_order(a.severity) >= min_order) {
      result = __as_concat(result, [a]);
    }
  }
  return result;
}
function generate_report(artifacts) {
  return artifacts.length === 0 ? (() => {
    return "No invisible artifacts detected.";
  })() : (() => {
    const header = __as_concat(__as_concat("Found ", String(artifacts.length)), ` invisible artifact(s):
`);
    let lines = header;
    for (const a of artifacts) {
      const sev_str = ((__scrut) => {
        if (__scrut.tag === "Critical") {
          return "CRITICAL";
        }
        if (__scrut.tag === "SevError") {
          return "ERROR";
        }
        if (__scrut.tag === "Warning") {
          return "WARNING";
        }
        if (__scrut.tag === "Info") {
          return "INFO";
        }
        throw new Error("non-exhaustive match");
      })(a.severity);
      lines = __as_concat(__as_concat(__as_concat(__as_concat(__as_concat(__as_concat(__as_concat(__as_concat(__as_concat(__as_concat(__as_concat(__as_concat(__as_concat(lines, "["), sev_str), "] "), a.name), " (0x"), String(a.hex_value).toUpperCase()), ") at L:"), String(a.line)), " C:"), String(a.column)), " - "), a.fix_action), `
`);
    }
    return lines;
  })();
}
export {
  scan_to_hex,
  scan,
  known_artifacts,
  get_artifact_def,
  generate_report,
  filter_by_severity,
  encode_byte,
  byte_to_hex,
  apply_fixes,
  Warning,
  SevError,
  Info,
  Critical
};
