// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Jonathan D.A. Jewell
//
// SchemaValidator.bun.js — a deliberate-subset JSON Schema validator.
//
// Zero-dependency policy: pulling in Ajv for four schemas would add a supply
// chain the project does not otherwise need. This validator implements
// exactly the constructs the four Empty-linter schemas use — and no more:
//
//   type, required, properties, additionalProperties (false only),
//   enum, const, items, minItems, minimum, maximum, pattern, anyOf, format
//   ("date-time" checked structurally).
//
// Unsupported constructs are a hard error at schema-load time, so the subset
// can never silently under-validate.

const SUPPORTED_KEYWORDS = new Set([
  "$schema", "$id", "title", "description", "type", "required", "properties",
  "additionalProperties", "enum", "const", "items", "minItems", "minimum",
  "maximum", "pattern", "anyOf", "format", "definitions",
]);

export class SchemaError extends Error {}

export function assertSchemaSupported(schema, path = "#") {
  if (schema === null || typeof schema !== "object") return;
  for (const key of Object.keys(schema)) {
    if (!SUPPORTED_KEYWORDS.has(key)) {
      throw new SchemaError(`${path}: unsupported JSON Schema keyword "${key}"`);
    }
  }
  for (const [key, value] of Object.entries(schema.properties ?? {})) {
    assertSchemaSupported(value, `${path}/properties/${key}`);
  }
  if (schema.items && typeof schema.items === "object") {
    assertSchemaSupported(schema.items, `${path}/items`);
  }
  for (const [index, sub] of (schema.anyOf ?? []).entries()) {
    assertSchemaSupported(sub, `${path}/anyOf/${index}`);
  }
  for (const [key, value] of Object.entries(schema.definitions ?? {})) {
    assertSchemaSupported(value, `${path}/definitions/${key}`);
  }
}

/**
 * Validate `value` against `schema` (already checked by
 * assertSchemaSupported). Returns a list of error strings; empty = valid.
 */
export function validate(value, schema, path = "$") {
  const errors = [];

  if (schema.const !== undefined && !deepEqual(value, schema.const)) {
    errors.push(`${path}: must equal ${JSON.stringify(schema.const)}`);
    return errors;
  }
  if (schema.enum !== undefined && !schema.enum.some((option) => deepEqual(option, value))) {
    errors.push(`${path}: must be one of ${schema.enum.map((o) => JSON.stringify(o)).join(", ")}`);
    return errors;
  }
  if (schema.anyOf !== undefined) {
    const branch = schema.anyOf.some((sub) => validate(value, sub, path).length === 0);
    if (!branch) errors.push(`${path}: does not satisfy any allowed alternative`);
    return errors;
  }

  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((type) => typeMatches(value, type))) {
      errors.push(`${path}: expected type ${schema.type}, got ${jsType(value)}`);
      return errors;
    }
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    if (schema.minimum !== undefined && value < schema.minimum) {
      errors.push(`${path}: ${value} < minimum ${schema.minimum}`);
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      errors.push(`${path}: ${value} > maximum ${schema.maximum}`);
    }
  }

  if (typeof value === "string") {
    if (schema.pattern !== undefined && !(new RegExp(schema.pattern, "u").test(value))) {
      errors.push(`${path}: does not match pattern ${schema.pattern}`);
    }
    if (schema.format === "date-time" && !isIsoDateTime(value)) {
      errors.push(`${path}: not an ISO-8601 date-time`);
    }
  }

  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      errors.push(`${path}: needs at least ${schema.minItems} item(s)`);
    }
    if (schema.items) {
      value.forEach((item, index) => {
        errors.push(...validate(item, schema.items, `${path}[${index}]`));
      });
    }
  }

  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    for (const key of schema.required ?? []) {
      if (!(key in value)) errors.push(`${path}: missing required key "${key}"`);
    }
    if (schema.additionalProperties === false) {
      const known = new Set(Object.keys(schema.properties ?? {}));
      for (const key of Object.keys(value)) {
        if (!known.has(key)) errors.push(`${path}: unexpected key "${key}"`);
      }
    }
    for (const [key, sub] of Object.entries(schema.properties ?? {})) {
      if (key in value) errors.push(...validate(value[key], sub, `${path}.${key}`));
    }
  }

  return errors;
}

function typeMatches(value, type) {
  switch (type) {
    case "object": return value !== null && typeof value === "object" && !Array.isArray(value);
    case "array": return Array.isArray(value);
    case "string": return typeof value === "string";
    case "integer": return Number.isInteger(value);
    case "number": return typeof value === "number" && Number.isFinite(value);
    case "boolean": return typeof value === "boolean";
    case "null": return value === null;
    default: throw new SchemaError(`unsupported type "${type}"`);
  }
}

function jsType(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function isIsoDateTime(value) {
  // 2026-09-21T12:34:56.789Z (+HH:MM offsets accepted)
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(value) && !Number.isNaN(Date.parse(value));
}

function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null) return false;
  if (Array.isArray(a)) {
    return Array.isArray(b) && a.length === b.length && a.every((item, i) => deepEqual(item, b[i]));
  }
  if (typeof a === "object") {
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    return ka.length === kb.length && ka.every((key) => deepEqual(a[key], b[key]));
  }
  return false;
}
