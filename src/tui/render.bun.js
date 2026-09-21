// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Jonathan D.A. Jewell
//
// render.bun.js — pure ANSI frame rendering for the TUI. Given state and a
// terminal size it returns the complete frame as an array of lines; tests pin
// the layout. Colour encodes severity, never meaning — the severity word is
// always present too.

import { visibleFindings, totalFindings } from "./model.bun.js";
import { hex } from "../core/UnicodeData.bun.js";
import { TOOL_VERSION } from "../core/Version.bun.js";

const RESET = "\u001b[0m";
const DIM = "\u001b[2m";
const BOLD = "\u001b[1m";
const INVERT = "\u001b[7m";
const SEVERITY_STYLE = {
  critical: "\u001b[41;37m", // white on red
  error: "\u001b[31m",
  warning: "\u001b[33m",
  info: "\u001b[36m",
};

function styled(severity, text) {
  return `${SEVERITY_STYLE[severity] ?? ""}${text}${RESET}`;
}

function truncate(text, width) {
  const visible = [...text];
  return visible.length <= width ? text : `${visible.slice(0, Math.max(0, width - 1)).join("")}…`;
}

function pad(text, width) {
  const length = [...text].length;
  return length >= width ? truncate(text, width) : text + " ".repeat(width - length);
}

/**
 * Render a full frame.
 * @returns {string[]} exactly `height` strings
 */
export function renderFrame(state, { width = 100, height = 30 } = {}) {
  const lines = [];
  const total = totalFindings(state);
  const shown = visibleFindings(state);

  const head = ` empty-linter ${TOOL_VERSION} · ${state.files.length} file(s) · ${total} finding(s)` +
    (state.severityFloor ? ` · ≥${state.severityFloor}` : "") +
    (state.nameFilter ? ` · /"${state.nameFilter}"` : "") +
    (state.filterInput !== null ? ` · typing: "${state.filterInput}"` : "");
  lines.push(`${BOLD}${pad(head, width)}${RESET}`);

  if (state.view === "help") {
    lines.push(...renderHelp(width, height - 2));
  } else if (state.view === "plan" && state.plan) {
    lines.push(...renderPlan(state, width, height - 2));
  } else if (state.view === "detail" && shown[state.cursor]) {
    lines.push(...renderDetail(shown[state.cursor], width, height - 2));
  } else {
    lines.push(...renderList(state, shown, width, height - 2));
  }

  while (lines.length < height - 1) lines.push("");
  lines.push(`${INVERT}${pad(` ${state.status}`, width)}${RESET}`);
  return lines.slice(0, height);
}

function renderList(state, rows, width, height) {
  const lines = [];
  const header = `  ${pad("SEV", 11)}${pad("NAME", 22)}${pad("U+", 9)}${pad("UTF-8", 12)}${pad("POS", 10)}FILE`;
  lines.push(`${DIM}${truncate(header, width)}${RESET}`);
  const bodyHeight = Math.max(1, height - 1);

  // Keep the cursor row in view.
  if (state.cursor < state.scroll) state.scroll = state.cursor;
  if (state.cursor >= state.scroll + bodyHeight) state.scroll = state.cursor - bodyHeight + 1;
  const windowRows = rows.slice(state.scroll, state.scroll + bodyHeight);

  if (rows.length === 0) {
    lines.push(`${DIM}  no findings match the current filters${RESET}`);
    return lines;
  }

  windowRows.forEach((row, i) => {
    const absolute = state.scroll + i;
    const f = row.finding;
    const cp = f.code_point === null ? "-" : `U+${hex(f.code_point)}`;
    const pos = f.line === null ? "-" : `${f.line}:${f.column}`;
    const cursor = absolute === state.cursor ? "›" : " ";
    const line = `${cursor} ${styled(f.severity, pad(f.severity.toUpperCase(), 9))}  ${pad(f.name, 22)}${pad(cp, 9)}${pad(f.utf8_hex ?? "-", 12)}${pad(pos, 10)}${truncate(row.path, Math.max(10, width - 66))}`;
    lines.push(absolute === state.cursor ? `${INVERT}${line}${RESET}` : line);
  });
  return lines;
}

function renderDetail(row, width, height) {
  const f = row.finding;
  const lines = [
    ` ${BOLD}${f.name}${RESET} ${f.unicode_name ? `· ${f.unicode_name}` : ""}`,
    ` severity  ${styled(f.severity, f.severity.toUpperCase())}   safety ${f.safety}   category ${f.category}`,
    ` position  line ${f.line} · Unicode-scalar column ${f.column} · UTF-8 byte offset ${f.byte_offset}`,
    ` scalar    ${f.code_point === null ? "-" : `U+${hex(f.code_point)}`} · UTF-8 bytes: ${f.utf8_hex ?? "-"}`,
    ` fix       ${f.fix?.kind ?? "review"}${f.fix?.with !== undefined ? ` → ${JSON.stringify(f.fix.with)}` : ""}`,
    "",
  ];
  if (f.description) lines.push(...wrap(` ${f.description}`, width).map((l) => `${DIM}${l}${RESET}`));
  if (f.context_escaped) {
    lines.push("", " context:");
    lines.push(`   ${f.context_escaped}`);
  }
  lines.push("", `${DIM} enter/esc back · r propose repair plan${RESET}`);
  return lines.slice(0, height).map((l) => truncate(l, width));
}

function renderPlan(state, width, height) {
  const plan = state.plan;
  const lines = [
    ` ${BOLD}repair plan${RESET} ${plan.plan_hash.slice(0, 16)}…  state: ${BOLD}${plan.state}${RESET}`,
    ` file ${plan.path} · input sha256 ${plan.input.sha256.slice(0, 16)}… · ${plan.input.bytes} bytes`,
    "",
    `  ${pad("DECISION", 10)}${pad("ACTION", 17)}${pad("CLASS", 12)}${pad("NAME", 22)}REASON`,
  ];
  const bodyHeight = Math.max(1, height - 8);
  for (const item of plan.items.slice(0, bodyHeight)) {
    const decision = item.grant_class === "semantic" ? "REFUSED" : item.action === "keep" ? "KEPT" : "pending";
    const decisionStyled = decision === "REFUSED" ? styled("warning", pad(decision, 10))
      : decision === "KEPT" ? `${DIM}${pad(decision, 10)}${RESET}`
      : pad(decision, 10);
    lines.push(truncate(`  ${decisionStyled}${pad(item.action, 17)}${pad(item.grant_class, 12)}${pad(item.finding.name, 22)}${item.reason}`, width));
  }
  if (plan.items.length > bodyHeight) {
    lines.push(`${DIM}  … ${plan.items.length - bodyHeight} more item(s) — see plan JSON for full review${RESET}`);
  }
  lines.push("", `${DIM} a approve mechanical · A approve mechanical + ambiguous · semantic items are never repairable · esc back${RESET}`);
  return lines;
}

function renderHelp(width, height) {
  const rows = [
    " keys",
    "   ↑/k, ↓/j        move · PgUp/PgDn jump · Home/End",
    "   enter           inspect finding (context, bytes, category, reason)",
    "   /               filter by artefact name · esc clears",
    "   1/2/3/4         severity floor: info/warning/error/critical (toggles)",
    "   r               propose a repair plan for the selected file (read-only)",
    "   a / A           approve mechanical / mechanical + reviewed ambiguous,",
    "                   then apply to copies under ./empty-linter-out/ and rescan",
    "   h or ?          this help · q quit",
    "",
    " invariants",
    "   · scanning never mutates input; applying never overwrites input",
    "   · semantic characters (joiners, variation selectors, script controls)",
    "     are never removed merely because they are invisible",
    "   · every application lands in provenance.jsonl with SHA-256 in/out",
    "   · repaired copies are rescanned; unexpected residue fails verification",
  ];
  return rows.slice(0, height).map((l) => truncate(pad(l, width), width));
}

function wrap(text, width) {
  const words = text.split(" ");
  const lines = [];
  let line = "";
  for (const word of words) {
    if ([...line].length + [...word].length + 1 > width) {
      lines.push(line);
      line = word;
    } else {
      line = line === "" ? word : `${line} ${word}`;
    }
  }
  if (line !== "") lines.push(line);
  return lines;
}
