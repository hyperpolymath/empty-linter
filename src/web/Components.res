// SPDX-License-Identifier: PMPL-1.0-or-later
// SPDX-FileCopyrightText: 2025 Hyperpolymath
//
// Web UI Components for empty-linter
// 🏆 Idris Inside - Uses proven library for safe rendering

open Proven_SafeString
open Proven_SafeWhitespace
open ByteDetector
open TextTransform

/** DOM bindings */
module Dom = {
  type element
  type document
  type event
  type inputEvent

  @val external document: document = "document"
  @send external getElementById: (document, string) => Js.Nullable.t<element> = "getElementById"
  @send external querySelector: (document, string) => Js.Nullable.t<element> = "querySelector"
  @send external querySelectorAll: (document, string) => array<element> = "querySelectorAll"
  @send external createElement: (document, string) => element = "createElement"

  @set external setInnerHTML: (element, string) => unit = "innerHTML"
  @set external setTextContent: (element, string) => unit = "textContent"
  @set external setValue: (element, string) => unit = "value"
  @set external setClassName: (element, string) => unit = "className"
  @set external setId: (element, string) => unit = "id"
  @set external setStyle: (element, string) => unit = "style"

  @get external getValue: element => string = "value"
  @get external getInnerHTML: element => string = "innerHTML"
  @get external getTextContent: element => string = "textContent"
  @get external getClassName: element => string = "className"

  @send external appendChild: (element, element) => unit = "appendChild"
  @send external removeChild: (element, element) => unit = "removeChild"
  @send external setAttribute: (element, string, string) => unit = "setAttribute"
  @send external getAttribute: (element, string) => Js.Nullable.t<string> = "getAttribute"
  @send external addEventListener: (element, string, event => unit) => unit = "addEventListener"
  @send external remove: element => unit = "remove"

  @get external target: event => element = "target"
  @send external preventDefault: event => unit = "preventDefault"
}

/** CSS styles for components */
module Styles = {
  let container = `
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    max-width: 800px;
    margin: 0 auto;
    padding: 20px;
  `

  let textarea = `
    width: 100%;
    min-height: 200px;
    padding: 12px;
    border: 2px solid #e0e0e0;
    border-radius: 8px;
    font-family: 'Monaco', 'Menlo', monospace;
    font-size: 14px;
    line-height: 1.5;
    resize: vertical;
    transition: border-color 0.2s;
  `

  let textareaFocus = `
    border-color: #7c3aed;
    outline: none;
  `

  let textareaError = `
    border-color: #ef4444;
  `

  let metricsBar = `
    display: flex;
    justify-content: space-between;
    padding: 8px 12px;
    background: #f5f5f5;
    border-radius: 6px;
    margin-top: 8px;
    font-size: 13px;
  `

  let metricItem = `
    display: flex;
    align-items: center;
    gap: 4px;
  `

  let metricValue = `
    font-weight: 600;
    color: #374151;
  `

  let metricLimit = `
    color: #9ca3af;
  `

  let metricOver = `
    color: #ef4444;
    font-weight: 700;
  `

  let artifactList = `
    margin-top: 12px;
    padding: 0;
    list-style: none;
  `

  let artifactItem = `
    display: flex;
    align-items: center;
    padding: 8px 12px;
    margin: 4px 0;
    border-radius: 6px;
    font-size: 13px;
  `

  let artifactCritical = `
    background: #fef2f2;
    border-left: 4px solid #ef4444;
  `

  let artifactError = `
    background: #fff7ed;
    border-left: 4px solid #f97316;
  `

  let artifactWarning = `
    background: #fefce8;
    border-left: 4px solid #eab308;
  `

  let artifactInfo = `
    background: #f0f9ff;
    border-left: 4px solid #0ea5e9;
  `

  let badge = `
    display: inline-block;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
  `

  let badgeCritical = `background: #ef4444; color: white;`
  let badgeError = `background: #f97316; color: white;`
  let badgeWarning = `background: #eab308; color: white;`
  let badgeInfo = `background: #0ea5e9; color: white;`

  let button = `
    padding: 10px 20px;
    border: none;
    border-radius: 6px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  `

  let buttonPrimary = `
    background: #7c3aed;
    color: white;
  `

  let buttonSecondary = `
    background: #e5e7eb;
    color: #374151;
  `

  let workspaceSelector = `
    display: flex;
    gap: 8px;
    margin-bottom: 16px;
    flex-wrap: wrap;
  `

  let workspaceButton = `
    padding: 8px 16px;
    border: 2px solid #e5e7eb;
    border-radius: 20px;
    background: white;
    cursor: pointer;
    transition: all 0.2s;
    font-size: 13px;
  `

  let workspaceButtonActive = `
    border-color: #7c3aed;
    background: #f5f3ff;
    color: #7c3aed;
  `

  let progressBar = `
    height: 4px;
    background: #e5e7eb;
    border-radius: 2px;
    margin-top: 8px;
    overflow: hidden;
  `

  let progressFill = `
    height: 100%;
    background: #7c3aed;
    transition: width 0.3s ease;
  `

  let progressOver = `
    background: #ef4444;
  `
}

/** Render metrics display
 *
 * 🏆 Idris Inside: Uses SafeString.escapeHtml for XSS-proof rendering
 */
let renderMetrics = (m: metrics, constraints: option<constraint_>): string => {
  let charDisplay = switch constraints {
  | Some(c) =>
    switch c.maxChars {
    | Some(max) =>
      let isOver = m.chars > max
      let style = if isOver { Styles.metricOver } else { Styles.metricValue }
      `<span style="${style}">${escapeHtml(Belt.Int.toString(m.chars))}</span>/<span style="${Styles.metricLimit}">${escapeHtml(Belt.Int.toString(max))}</span>`
    | None =>
      `<span style="${Styles.metricValue}">${escapeHtml(Belt.Int.toString(m.chars))}</span>`
    }
  | None =>
    `<span style="${Styles.metricValue}">${escapeHtml(Belt.Int.toString(m.chars))}</span>`
  }

  let wordDisplay = switch constraints {
  | Some(c) =>
    switch c.maxWords {
    | Some(max) =>
      let isOver = m.words > max
      let style = if isOver { Styles.metricOver } else { Styles.metricValue }
      `<span style="${style}">${escapeHtml(Belt.Int.toString(m.words))}</span>/<span style="${Styles.metricLimit}">${escapeHtml(Belt.Int.toString(max))}</span>`
    | None =>
      `<span style="${Styles.metricValue}">${escapeHtml(Belt.Int.toString(m.words))}</span>`
    }
  | None =>
    `<span style="${Styles.metricValue}">${escapeHtml(Belt.Int.toString(m.words))}</span>`
  }

  `<div style="${Styles.metricsBar}">
    <div style="${Styles.metricItem}">
      <span>Characters:</span> ${charDisplay}
    </div>
    <div style="${Styles.metricItem}">
      <span>Words:</span> ${wordDisplay}
    </div>
    <div style="${Styles.metricItem}">
      <span>Lines:</span> <span style="${Styles.metricValue}">${escapeHtml(Belt.Int.toString(m.lines))}</span>
    </div>
  </div>`
}

/** Render progress bar for character limit */
let renderProgressBar = (current: int, max: int): string => {
  let percentage = Belt.Float.toInt(Belt.Int.toFloat(current) /. Belt.Int.toFloat(max) *. 100.0)
  let clampedPercentage = if percentage > 100 { 100 } else { percentage }
  let fillStyle = if percentage > 100 {
    Styles.progressFill ++ Styles.progressOver
  } else {
    Styles.progressFill
  }

  `<div style="${Styles.progressBar}">
    <div style="${fillStyle} width: ${Belt.Int.toString(clampedPercentage)}%;"></div>
  </div>`
}

/** Render artifact badge */
let renderArtifactBadge = (severity: severity): string => {
  let (text, style) = switch severity {
  | Critical => ("CRIT", Styles.badge ++ Styles.badgeCritical)
  | Error => ("ERR", Styles.badge ++ Styles.badgeError)
  | Warning => ("WARN", Styles.badge ++ Styles.badgeWarning)
  | Info => ("INFO", Styles.badge ++ Styles.badgeInfo)
  }
  `<span style="${style}">${text}</span>`
}

/** Render artifact list
 *
 * 🏆 Idris Inside: Uses SafeString.escapeHtml for XSS-proof output
 */
let renderArtifacts = (artifacts: array<artifact>): string => {
  if Belt.Array.length(artifacts) == 0 {
    ""
  } else {
    let items = artifacts->Belt.Array.map(a => {
      let itemStyle = switch a.severity {
      | Critical => Styles.artifactItem ++ Styles.artifactCritical
      | Error => Styles.artifactItem ++ Styles.artifactError
      | Warning => Styles.artifactItem ++ Styles.artifactWarning
      | Info => Styles.artifactItem ++ Styles.artifactInfo
      }

      `<li style="${itemStyle}">
        ${renderArtifactBadge(a.severity)}
        <span style="margin-left: 12px; font-weight: 500;">${escapeHtml(a.name)}</span>
        <span style="margin-left: 8px; color: #6b7280;">0x${escapeHtml(Js.String2.toUpperCase(a.hexValue))}</span>
        <span style="margin-left: auto; color: #9ca3af;">L${escapeHtml(Belt.Int.toString(a.line))}:C${escapeHtml(Belt.Int.toString(a.column))}</span>
      </li>`
    })

    `<ul style="${Styles.artifactList}">${Js.Array2.joinWith(items, "")}</ul>`
  }
}

/** Render workspace selector buttons */
let renderWorkspaceSelector = (activeWorkspace: string): string => {
  let workspaceNames = ["default", "twitter", "linkedin", "github-issue", "jira", "email"]

  let buttons = workspaceNames->Belt.Array.map(name => {
    let isActive = name == activeWorkspace
    let buttonStyle = if isActive {
      Styles.workspaceButton ++ Styles.workspaceButtonActive
    } else {
      Styles.workspaceButton
    }
    `<button style="${buttonStyle}" data-workspace="${escapeHtml(name)}">${escapeHtml(name)}</button>`
  })

  `<div style="${Styles.workspaceSelector}">${Js.Array2.joinWith(buttons, "")}</div>`
}

/** Render action buttons */
let renderActions = (): string => {
  `<div style="display: flex; gap: 12px; margin-top: 16px;">
    <button style="${Styles.button} ${Styles.buttonPrimary}" id="el-fix-btn">Fix All</button>
    <button style="${Styles.button} ${Styles.buttonSecondary}" id="el-transform-btn">Transform</button>
    <button style="${Styles.button} ${Styles.buttonSecondary}" id="el-copy-btn">Copy Clean</button>
  </div>`
}

/** Main component state */
type componentState = {
  mutable content: string,
  mutable workspace: string,
  mutable artifacts: array<artifact>,
  mutable metrics: metrics,
  mutable constraints: option<constraint_>,
}

/** Create initial state */
let createState = (): componentState => {
  {
    content: "",
    workspace: "default",
    artifacts: [],
    metrics: { chars: 0, charsNoWhitespace: 0, words: 0, lines: 0, paragraphs: 0 },
    constraints: None,
  }
}

/** Update state from content */
let updateState = (state: componentState, content: string): unit => {
  state.content = content
  state.artifacts = scan(content)
  state.metrics = getMetrics(content)

  // Get constraints from workspace
  state.constraints = switch getWorkspace(state.workspace) {
  | Some(ws) => Some(ws.constraints)
  | None => None
  }
}

/** Render full component
 *
 * 🏆 Idris Inside: All user content escaped via SafeString
 */
let render = (state: componentState): string => {
  let progressHtml = switch state.constraints {
  | Some(c) =>
    switch c.maxChars {
    | Some(max) => renderProgressBar(state.metrics.chars, max)
    | None => ""
    }
  | None => ""
  }

  `<div style="${Styles.container}">
    <h2 style="margin-bottom: 16px; color: #7c3aed;">Empty Linter</h2>
    ${renderWorkspaceSelector(state.workspace)}
    <textarea
      id="el-input"
      style="${Styles.textarea}"
      placeholder="Paste your text here..."
    >${escapeHtml(state.content)}</textarea>
    ${progressHtml}
    ${renderMetrics(state.metrics, state.constraints)}
    ${renderArtifacts(state.artifacts)}
    ${renderActions()}
  </div>`
}
