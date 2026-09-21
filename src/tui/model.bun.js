// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Jonathan D.A. Jewell
//
// model.bun.js — the TUI's pure state machine. Every interaction is a key
// event reduced into new state; side effects are expressed as *intents* that
// the IO shell executes and answers with events. Nothing here touches the
// terminal, the filesystem, or the network — that is what makes the interface
// fully unit-testable and keeps the truth conditions: scanning is read-only;
// repair always plans first and only ever writes copies.

export const SEVERITIES = ["info", "warning", "error", "critical"];
export const SEVERITY_KEY = { 1: "info", 2: "warning", 3: "error", 4: "critical" };

/**
 * @param {Array<{path: string, findings: object[], scannedScalars: number}>} files
 */
export function initialState(files, { settingsSource = "defaults", threshold = "critical" } = {}) {
  return {
    files,
    cursor: 0, // index into the *filtered* finding list
    scroll: 0,
    view: "findings", // findings | detail | plan | help
    severityFloor: null, // null = show all
    nameFilter: "", // substring filter on finding name
    filterInput: null, // non-null while typing a name filter
    threshold, // blocking threshold (display only)
    settingsSource,
    plan: null, // plan for the current row's file (plan view)
    planGrant: { mechanical: false, ambiguous: false },
    status: "scan complete — ↑/↓ move · enter inspect · / filter · r plan · h help · q quit",
    settings: { settingsSource, threshold },
    effects: [], // intents for the IO shell, drained by entry.bun.js
    generation: 0, // bumps when results refresh
  };
}

/** Flat, filtered finding list in deterministic order. */
export function visibleFindings(state) {
  const floor = state.severityFloor === null ? 1 : SEVERITIES.indexOf(state.severityFloor) + 1;
  const rows = [];
  for (const file of state.files) {
    for (const finding of file.findings) {
      const rank = SEVERITIES.indexOf(finding.severity) + 1;
      if (rank < floor) continue;
      if (state.nameFilter !== "" && !finding.name.toLowerCase().includes(state.nameFilter.toLowerCase())) continue;
      rows.push({ path: file.path, finding });
    }
  }
  rows.sort((a, b) => a.path.localeCompare(b.path) || (a.finding.byte_offset ?? 0) - (b.finding.byte_offset ?? 0));
  return rows;
}

export const totalFindings = (state) => state.files.reduce((n, f) => n + f.findings.length, 0);

/**
 * Reduce one key event. May return a state with `effects` entries for the IO
 * shell: {type:"plan", path} | {type:"apply", plan, grant} | {type:"quit"}.
 */
export function reduce(state, key) {
  if (key.name === "ctrl-c") return quit(state);

  // Filter-input mode captures all keys until enter/esc.
  if (state.filterInput !== null) {
    if (key.name === "enter") {
      return { ...state, nameFilter: state.filterInput, filterInput: null, cursor: 0, scroll: 0, status: `filter: "${state.filterInput}"` };
    }
    if (key.name === "esc") {
      return { ...state, filterInput: null, nameFilter: "", cursor: 0, scroll: 0, status: "filter cleared" };
    }
    if (key.name === "backspace") {
      return { ...state, filterInput: state.filterInput.slice(0, -1) };
    }
    if (key.printable && typeof key.char === "string") {
      return { ...state, filterInput: state.filterInput + key.char };
    }
    return state;
  }

  switch (key.name) {
    case "q": return quit(state);
    case "h": case "?": return { ...state, view: state.view === "help" ? "findings" : "help" };
    case "esc": {
      if (state.view !== "findings") return { ...state, view: "findings", plan: null };
      if (state.nameFilter !== "" || state.severityFloor !== null) {
        return { ...state, nameFilter: "", severityFloor: null, cursor: 0, scroll: 0, status: "filters cleared" };
      }
      return state;
    }
    case "/": return { ...state, filterInput: "" };
    case "1": case "2": case "3": case "4": {
      const sev = SEVERITY_KEY[key.name];
      const floor = state.severityFloor === sev ? null : sev;
      return { ...state, severityFloor: floor, cursor: 0, scroll: 0, status: floor === null ? "severity filter off" : `showing ≥ ${floor}` };
    }
    case "up": case "k": return move(state, -1);
    case "down": case "j": return move(state, +1);
    case "pageup": return move(state, -10);
    case "pagedown": return move(state, +10);
    case "home": return { ...state, cursor: 0 };
    case "end": return move(state, Number.MAX_SAFE_INTEGER);
    case "enter": {
      if (state.view === "detail") return { ...state, view: "findings" };
      if (visibleFindings(state).length === 0) return state;
      return { ...state, view: "detail" };
    }
    case "r": return requestPlan(state);
    case "a": case "A": return grantAndApply(state, key.name === "A");
    default: return state;
  }
}

function quit(state) {
  return { ...state, effects: [...state.effects, { type: "quit" }] };
}

function move(state, delta) {
  const count = visibleFindings(state).length;
  if (count === 0) return { ...state, cursor: 0 };
  const cursor = Math.min(count - 1, Math.max(0, state.cursor + delta));
  return { ...state, cursor };
}

function requestPlan(state) {
  const row = visibleFindings(state)[state.cursor];
  if (!row) return { ...state, status: "no finding selected" };
  return {
    ...state,
    status: `planning repair for ${row.path}…`,
    effects: [...state.effects, { type: "plan", path: row.path }],
  };
}

function grantAndApply(state, includeAmbiguous) {
  if (state.plan === null || state.plan.state !== "proposed") {
    return { ...state, status: "no proposed plan to act on (press r first)" };
  }
  const grant = { mechanical: true, ambiguous: includeAmbiguous ? "all-in-plan" : [], rationale: includeAmbiguous ? "TUI: mechanical + reviewed ambiguous grant" : "TUI: mechanical grant" };
  return {
    ...state,
    status: includeAmbiguous ? "applying mechanical + reviewed ambiguous…" : "applying mechanical only…",
    effects: [...state.effects, { type: "apply", plan: state.plan, grant }],
  };
}

/** Event from the IO shell: a plan is ready for review. */
export function planReady(state, plan) {
  const approved = plan.items.filter((i) => i.grant_class !== "semantic" && i.action !== "keep").length;
  return {
    ...state,
    view: "plan",
    plan,
    status: `plan ${plan.plan_hash.slice(0, 12)}… · ${plan.items.length} finding(s), ${approved} repairable · a mechanical · A +ambiguous · esc back`,
  };
}

/** Event from the IO shell: apply+verify completed. */
export function applyDone(state, { verified, outputPath, appliedEdits, rescanRecord }) {
  return {
    ...state,
    view: "findings",
    plan: null,
    status: verified
      ? `applied ${appliedEdits} change(s) → ${outputPath} · rescan verified ✔`
      : `applied ${appliedEdits} change(s) → ${outputPath} · RESCAN MISMATCH — see ${rescanRecord?.unexpected?.length ?? "?"} unexpected`,
  };
}

/** Event from the IO shell: an operation failed distinctly. */
export function operationFailed(state, message) {
  return { ...state, plan: null, status: `error: ${message}` };
}
