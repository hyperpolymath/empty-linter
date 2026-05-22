// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2025 Hyperpolymath
//
// Embeddable Widget for empty-linter
// 🏆 Idris Inside - Uses proven library for safe operations

open Components
open ByteDetector
open TextTransform
open Proven_SafeString

/** Widget configuration */
type widgetConfig = {
  targetId: string,
  workspace: string,
  showMetrics: bool,
  showArtifacts: bool,
  showActions: bool,
  autoFix: bool,
  onChange: option<string => unit>,
  onViolation: option<array<string> => unit>,
}

/** Default widget configuration */
let defaultWidgetConfig: widgetConfig = {
  targetId: "empty-linter-widget",
  workspace: "default",
  showMetrics: true,
  showArtifacts: true,
  showActions: true,
  autoFix: false,
  onChange: None,
  onViolation: None,
}

/** Widget instance */
type widget = {
  config: widgetConfig,
  state: componentState,
  container: Dom.element,
}

/** Handle input change */
let handleInput = (widget: widget, content: string): unit => {
  updateState(widget.state, content)

  // Auto-fix if enabled
  let finalContent = if widget.config.autoFix {
    let (fixed, _) = applyFixes(content)
    fixed
  } else {
    content
  }

  // Call onChange callback
  switch widget.config.onChange {
  | Some(callback) => callback(finalContent)
  | None => ()
  }

  // Check constraints and call onViolation
  switch getWorkspace(widget.state.workspace) {
  | Some(ws) =>
    let violations = checkConstraints(finalContent, ws.constraints)
    if Belt.Array.length(violations) > 0 {
      switch widget.config.onViolation {
      | Some(callback) => callback(violations)
      | None => ()
      }
    }
  | None => ()
  }

  // Re-render
  Dom.setInnerHTML(widget.container, render(widget.state))
  setupEventListeners(widget)
}

/** Handle fix button click */
and handleFix = (widget: widget): unit => {
  let (fixed, _) = applyFixes(widget.state.content)
  widget.state.content = fixed
  updateState(widget.state, fixed)

  // Update textarea
  switch Dom.getElementById(Dom.document, "el-input")->Js.Nullable.toOption {
  | Some(textarea) => Dom.setValue(textarea, fixed)
  | None => ()
  }

  Dom.setInnerHTML(widget.container, render(widget.state))
  setupEventListeners(widget)
}

/** Handle transform button click */
and handleTransform = (widget: widget): unit => {
  let transformed = switch getWorkspace(widget.state.workspace) {
  | Some(ws) =>
    transform(widget.state.content, ws.transformOptions)
  | None =>
    transformDefault(widget.state.content)
  }

  widget.state.content = transformed
  updateState(widget.state, transformed)

  switch Dom.getElementById(Dom.document, "el-input")->Js.Nullable.toOption {
  | Some(textarea) => Dom.setValue(textarea, transformed)
  | None => ()
  }

  Dom.setInnerHTML(widget.container, render(widget.state))
  setupEventListeners(widget)
}

/** Handle copy button click */
and handleCopy = (widget: widget): unit => {
  // Apply fixes and transform before copying
  let (fixed, _) = applyFixes(widget.state.content)
  let clean = switch getWorkspace(widget.state.workspace) {
  | Some(ws) => transform(fixed, ws.transformOptions)
  | None => transformDefault(fixed)
  }

  // Copy to clipboard
  %raw(`navigator.clipboard.writeText(clean)`)
}

/** Handle workspace change */
and handleWorkspaceChange = (widget: widget, workspace: string): unit => {
  widget.state.workspace = workspace
  widget.config.workspace = workspace

  // Update constraints
  widget.state.constraints = switch getWorkspace(workspace) {
  | Some(ws) => Some(ws.constraints)
  | None => None
  }

  Dom.setInnerHTML(widget.container, render(widget.state))
  setupEventListeners(widget)
}

/** Set up event listeners */
and setupEventListeners = (widget: widget): unit => {
  // Input listener
  switch Dom.getElementById(Dom.document, "el-input")->Js.Nullable.toOption {
  | Some(textarea) =>
    Dom.addEventListener(textarea, "input", (e) => {
      let target = Dom.target(e)
      let value = Dom.getValue(target)
      handleInput(widget, value)
    })
  | None => ()
  }

  // Fix button
  switch Dom.getElementById(Dom.document, "el-fix-btn")->Js.Nullable.toOption {
  | Some(btn) =>
    Dom.addEventListener(btn, "click", (_) => {
      handleFix(widget)
    })
  | None => ()
  }

  // Transform button
  switch Dom.getElementById(Dom.document, "el-transform-btn")->Js.Nullable.toOption {
  | Some(btn) =>
    Dom.addEventListener(btn, "click", (_) => {
      handleTransform(widget)
    })
  | None => ()
  }

  // Copy button
  switch Dom.getElementById(Dom.document, "el-copy-btn")->Js.Nullable.toOption {
  | Some(btn) =>
    Dom.addEventListener(btn, "click", (_) => {
      handleCopy(widget)
    })
  | None => ()
  }

  // Workspace buttons
  let workspaceButtons = Dom.querySelectorAll(Dom.document, "[data-workspace]")
  workspaceButtons->Belt.Array.forEach(btn => {
    Dom.addEventListener(btn, "click", (_) => {
      switch Dom.getAttribute(btn, "data-workspace")->Js.Nullable.toOption {
      | Some(workspace) => handleWorkspaceChange(widget, workspace)
      | None => ()
      }
    })
  })
}

/** Initialize widget */
let init = (config: widgetConfig): option<widget> => {
  switch Dom.getElementById(Dom.document, config.targetId)->Js.Nullable.toOption {
  | None => None
  | Some(container) =>
    let state = createState()
    state.workspace = config.workspace

    // Set initial constraints
    state.constraints = switch getWorkspace(config.workspace) {
    | Some(ws) => Some(ws.constraints)
    | None => None
    }

    let widget = {
      config: config,
      state: state,
      container: container,
    }

    // Initial render
    Dom.setInnerHTML(container, render(state))
    setupEventListeners(widget)

    Some(widget)
  }
}

/** Initialize with default config */
let initDefault = (): option<widget> => {
  init(defaultWidgetConfig)
}

/** Destroy widget */
let destroy = (widget: widget): unit => {
  Dom.setInnerHTML(widget.container, "")
}

/** Get current content */
let getContent = (widget: widget): string => {
  widget.state.content
}

/** Set content programmatically */
let setContent = (widget: widget, content: string): unit => {
  handleInput(widget, content)
}

/** Get cleaned content (fixed + transformed) */
let getCleanContent = (widget: widget): string => {
  let (fixed, _) = applyFixes(widget.state.content)
  switch getWorkspace(widget.state.workspace) {
  | Some(ws) => transform(fixed, ws.transformOptions)
  | None => transformDefault(fixed)
  }
}

/** Export for browser global */
let exportGlobals = (): unit => {
  %raw(`
    window.EmptyLinter = {
      init: init,
      initDefault: initDefault,
      destroy: destroy,
      getContent: getContent,
      setContent: setContent,
      getCleanContent: getCleanContent,
      defaultConfig: defaultWidgetConfig
    }
  `)
}
