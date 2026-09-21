// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Jonathan D.A. Jewell
//
// The TUI is fully unit-testable because its state machine and renderer are
// pure: only entry.bun.js touches the terminal. Key sequences are built from
// numeric bytes (see CSI()) so this file never contains a raw ESC byte —
// Empty-linter audits its own test suite.

import { expect, test } from "bun:test";
import { initialState, reduce, visibleFindings, planReady, applyDone, operationFailed } from "../src/tui/model.bun.js";
import { renderFrame } from "../src/tui/render.bun.js";
import { decodeKeys } from "../src/tui/keys.bun.js";

function makeFinding(overrides = {}) {
  return {
    code_point: 0xa0, utf8_hex: "C2 A0", name: "NBSP", unicode_name: "NO-BREAK SPACE",
    category: "Zs", severity: "error", safety: "mechanical",
    fix: { kind: "replace", with: " " }, description: "Non-breaking space.",
    line: 1, column: 2, byte_offset: 1, scalar_index: 1,
    context_escaped: "a⟦U+00A0 NBSP⟧b",
    ...overrides,
  };
}

function makeState() {
  return initialState([
    { path: "a.txt", findings: [makeFinding({ name: "NBSP" }), makeFinding({ name: "ZWJ", code_point: 0x200d, severity: "warning", safety: "semantic", fix: { kind: "keep" } })], scannedScalars: 100 },
    { path: "b.txt", findings: [makeFinding({ name: "RLO", code_point: 0x202e, severity: "critical", safety: "ambiguous" })], scannedScalars: 50 },
  ]);
}

// ── Keys ──────────────────────────────────────────────────────────────────────

test("keys: decodes arrows, enter, esc, backspace, ctrl-c, printables", () => {
  const names = (bytes) => decodeKeys(new Uint8Array(bytes)).map((k) => k.name);
  const CSI = (final) => names([0x1b, 0x5b, final.codePointAt(0)]);
  expect(CSI("A")).toEqual(["up"]);
  expect(CSI("B")).toEqual(["down"]);
  expect(CSI("D")).toEqual(["left"]);
  expect(CSI("C")).toEqual(["right"]);
  expect(names([0x1b, 0x5b, 0x35, 0x7e])).toEqual(["pageup"]);
  expect(names([0x1b, 0x5b, 0x36, 0x7e])).toEqual(["pagedown"]);
  expect(names([0x0d])).toEqual(["enter"]);
  expect(names([0x1b])).toEqual(["esc"]);
  expect(names([0x7f])).toEqual(["backspace"]);
  expect(names([0x03])[0]).toBe("ctrl-c");
  const encoder = new TextEncoder();
  const printable = decodeKeys(encoder.encode("aZ1/")).map((k) => k.name);
  expect(printable).toEqual(["a", "Z", "1", "/"]);
});

// ── Model ─────────────────────────────────────────────────────────────────────

test("model: cursor moves within the filtered list and clamps", () => {
  let state = makeState();
  expect(visibleFindings(state).length).toBe(3);
  state = reduce(state, { name: "down" });
  expect(state.cursor).toBe(1);
  state = reduce(state, { name: "down" });
  state = reduce(state, { name: "down" });
  state = reduce(state, { name: "down" }); // clamp at the end
  expect(state.cursor).toBe(2);
  state = reduce(state, { name: "up" });
  expect(state.cursor).toBe(1);
});

test("model: severity floor keys filter and toggle", () => {
  let state = makeState();
  state = reduce(state, { name: "3" }); // error and above
  expect(state.severityFloor).toBe("error");
  expect(visibleFindings(state).map((r) => r.finding.name).sort()).toEqual(["NBSP", "RLO"]);
  state = reduce(state, { name: "3" });
  expect(state.severityFloor).toBeNull();
});

test("model: name filter input captures text until enter", () => {
  let state = makeState();
  state = reduce(state, { name: "/" });
  for (const char of "zwj") state = reduce(state, { name: char, printable: true, char });
  expect(state.filterInput).toBe("zwj");
  state = reduce(state, { name: "enter" });
  expect(state.nameFilter).toBe("zwj");
  expect(visibleFindings(state).map((r) => r.finding.name)).toEqual(["ZWJ"]);
  state = reduce(state, { name: "esc" });
  expect(state.nameFilter).toBe("");
});

test("model: enter toggles the detail view; esc returns", () => {
  let state = makeState();
  state = reduce(state, { name: "enter" });
  expect(state.view).toBe("detail");
  state = reduce(state, { name: "esc" });
  expect(state.view).toBe("findings");
});

test("model: r emits a plan intent for the selected file only", () => {
  let state = makeState();
  state = reduce(state, { name: "r" });
  expect(state.effects).toEqual([{ type: "plan", path: "a.txt" }]);
});

test("model: plan → approve intent carries the conservative grant", () => {
  let state = makeState();
  const plan = {
    state: "proposed", path: "a.txt", plan_hash: "ab".repeat(32),
    items: [
      { finding: { name: "NBSP" }, grant_class: "mechanical", action: "replace-space" },
      { finding: { name: "ZWJ" }, grant_class: "semantic", action: "keep" },
    ],
  };
  state = planReady(state, plan);
  expect(state.view).toBe("plan");
  state = reduce(state, { name: "a" });
  expect(state.effects[0].type).toBe("apply");
  expect(state.effects[0].grant.mechanical).toBe(true);
  expect(state.effects[0].grant.ambiguous).toEqual([]); // 'a' grants mechanical only
});

test("model: apply without a proposed plan is refused in the status line", () => {
  let state = makeState();
  state = reduce(state, { name: "a" });
  expect(state.status).toContain("no proposed plan");
  expect(state.effects).toEqual([]);
});

test("model: applyDone reports verification outcome honestly", () => {
  let state = makeState();
  state = applyDone(state, { verified: false, outputPath: "out/a.txt", appliedEdits: 3, rescanRecord: { unexpected: [{}, {}] } });
  expect(state.status).toContain("RESCAN MISMATCH");
  state = applyDone(state, { verified: true, outputPath: "out/a.txt", appliedEdits: 3 });
  expect(state.status).toContain("verified");
  state = operationFailed(state, "boom");
  expect(state.status).toContain("error: boom");
});

// ── Rendering ─────────────────────────────────────────────────────────────────

test("render: frame fits the terminal and shows severities", () => {
  const state = makeState();
  const frame = renderFrame(state, { width: 90, height: 24 });
  expect(frame.length).toBe(24);
  const joined = frame.join("\n");
  expect(joined).toContain("empty-linter");
  expect(joined).toContain("NBSP");
  expect(joined).toContain("RLO");
  expect(joined).toContain("CRITICAL");
});

test("render: help view lists the invariants", () => {
  let state = makeState();
  state = reduce(state, { name: "h" });
  const frame = renderFrame(state, { width: 90, height: 24 });
  const joined = frame.join("\n");
  expect(joined).toContain("mutates input");
  expect(joined).toContain("semantic characters");
});
