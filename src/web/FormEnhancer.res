// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2025 Hyperpolymath
//
// FormEnhancer - Automatically enhance textareas with empty-linter
// 🏆 Idris Inside - Uses proven library for safe operations

open Components
open ByteDetector
open TextTransform
open Proven_SafeString

/** Form field constraint types detected from DOM */
type fieldConstraint = {
  maxLength: option<int>,
  minLength: option<int>,
  required: bool,
  pattern: option<string>,
}

/** Enhanced field tracking */
type enhancedField = {
  element: Dom.element,
  originalPlaceholder: option<string>,
  constraints: fieldConstraint,
  metricsElement: option<Dom.element>,
  state: componentState,
}

/** Global state for form enhancer */
type enhancerState = {
  mutable fields: array<enhancedField>,
  mutable enabled: bool,
  mutable showMetrics: bool,
  mutable autoFix: bool,
}

let globalState: enhancerState = {
  fields: [],
  enabled: false,
  showMetrics: true,
  autoFix: false,
}

/** Parse integer from attribute value */
let parseIntAttr = (value: Js.Nullable.t<string>): option<int> => {
  switch Js.Nullable.toOption(value) {
  | Some(s) => Belt.Int.fromString(s)
  | None => None
  }
}

/** Extract constraints from form element attributes */
let extractConstraints = (element: Dom.element): fieldConstraint => {
  {
    maxLength: parseIntAttr(Dom.getAttribute(element, "maxlength")),
    minLength: parseIntAttr(Dom.getAttribute(element, "minlength")),
    required: switch Dom.getAttribute(element, "required")->Js.Nullable.toOption {
    | Some(_) => true
    | None => false
    },
    pattern: Dom.getAttribute(element, "pattern")->Js.Nullable.toOption,
  }
}

/** Create metrics display element */
let createMetricsElement = (constraints: fieldConstraint): Dom.element => {
  let el = Dom.createElement(Dom.document, "div")
  Dom.setClassName(el, "el-metrics")
  Dom.setStyle(el, `
    font-size: 12px;
    color: #6b7280;
    margin-top: 4px;
    display: flex;
    justify-content: space-between;
    padding: 4px 8px;
    background: #f9fafb;
    border-radius: 4px;
  `)
  el
}

/** Update metrics display */
let updateMetricsDisplay = (field: enhancedField, content: string): unit => {
  let m = getMetrics(content)
  let artifacts = scan(content)

  switch field.metricsElement {
  | Some(el) =>
    let charDisplay = switch field.constraints.maxLength {
    | Some(max) =>
      let isOver = m.chars > max
      let color = if isOver { "#ef4444" } else { "#374151" }
      `<span style="color: ${color}; font-weight: ${if isOver { "700" } else { "500" }}">${Belt.Int.toString(m.chars)}</span>/${Belt.Int.toString(max)}`
    | None =>
      Belt.Int.toString(m.chars)
    }

    let artifactWarning = if Belt.Array.length(artifacts) > 0 {
      `<span style="color: #f97316;">⚠ ${Belt.Int.toString(Belt.Array.length(artifacts))} invisible</span>`
    } else {
      ""
    }

    Dom.setInnerHTML(el, `
      <span>Characters: ${charDisplay}</span>
      <span>Words: ${Belt.Int.toString(m.words)}</span>
      ${artifactWarning}
    `)
  | None => ()
  }
}

/** Handle field input */
let handleFieldInput = (field: enhancedField, content: string): unit => {
  updateState(field.state, content)

  // Auto-fix if enabled
  if globalState.autoFix {
    let (fixed, count) = applyFixes(content)
    if count > 0 {
      Dom.setValue(field.element, fixed)
      updateState(field.state, fixed)
    }
  }

  updateMetricsDisplay(field, field.state.content)

  // Update border color based on constraint status
  let isOverLimit = switch field.constraints.maxLength {
  | Some(max) => field.state.metrics.chars > max
  | None => false
  }

  let hasArtifacts = Belt.Array.length(field.state.artifacts) > 0

  let borderColor = if isOverLimit {
    "#ef4444"  // Red for over limit
  } else if hasArtifacts {
    "#f97316"  // Orange for artifacts
  } else {
    "#e5e7eb"  // Default gray
  }

  Dom.setStyle(field.element, `border-color: ${borderColor}; transition: border-color 0.2s;`)
}

/** Enhance a single textarea or input */
let enhanceField = (element: Dom.element): enhancedField => {
  let constraints = extractConstraints(element)
  let state = createState()

  // Get initial content
  let initialContent = Dom.getValue(element)
  updateState(state, initialContent)

  // Store original placeholder
  let originalPlaceholder = Dom.getAttribute(element, "placeholder")->Js.Nullable.toOption

  // Create metrics element if showing metrics
  let metricsElement = if globalState.showMetrics {
    let metricsEl = createMetricsElement(constraints)

    // Insert after the element
    %raw(`element.parentNode.insertBefore(metricsEl, element.nextSibling)`)

    Some(metricsEl)
  } else {
    None
  }

  let field = {
    element: element,
    originalPlaceholder: originalPlaceholder,
    constraints: constraints,
    metricsElement: metricsElement,
    state: state,
  }

  // Set up input listener
  Dom.addEventListener(element, "input", (_e) => {
    let content = Dom.getValue(element)
    handleFieldInput(field, content)
  })

  // Set up paste listener for auto-fix
  Dom.addEventListener(element, "paste", (_e) => {
    // Delay to get pasted content
    %raw(`
      setTimeout(() => {
        const content = element.value;
        handleFieldInput(field, content);
      }, 0)
    `)
  })

  // Initial metrics update
  updateMetricsDisplay(field, initialContent)

  field
}

/** Find all textareas and text inputs on page */
let findTextFields = (): array<Dom.element> => {
  let textareas = Dom.querySelectorAll(Dom.document, "textarea")
  let textInputs = Dom.querySelectorAll(Dom.document, "input[type='text']")

  Belt.Array.concat(textareas, textInputs)
}

/** Enhance all text fields on page */
let enhanceAll = (): unit => {
  let fields = findTextFields()
  globalState.fields = fields->Belt.Array.map(enhanceField)
  globalState.enabled = true
}

/** Remove enhancement from a field */
let removeEnhancement = (field: enhancedField): unit => {
  // Remove metrics element
  switch field.metricsElement {
  | Some(el) => Dom.remove(el)
  | None => ()
  }

  // Reset border style
  Dom.setStyle(field.element, "")
}

/** Disable all enhancements */
let disableAll = (): unit => {
  globalState.fields->Belt.Array.forEach(removeEnhancement)
  globalState.fields = []
  globalState.enabled = false
}

/** Toggle enhancements */
let toggle = (): bool => {
  if globalState.enabled {
    disableAll()
  } else {
    enhanceAll()
  }
  globalState.enabled
}

/** Configure enhancer */
let configure = (showMetrics: bool, autoFix: bool): unit => {
  globalState.showMetrics = showMetrics
  globalState.autoFix = autoFix

  // Re-enhance if already enabled
  if globalState.enabled {
    disableAll()
    enhanceAll()
  }
}

/** Get clean content from a field by index */
let getCleanContent = (index: int): option<string> => {
  switch Belt.Array.get(globalState.fields, index) {
  | Some(field) =>
    let (fixed, _) = applyFixes(field.state.content)
    Some(transformDefault(fixed))
  | None => None
  }
}

/** Fix all fields */
let fixAllFields = (): int => {
  let totalFixes = ref(0)

  globalState.fields->Belt.Array.forEach(field => {
    let (fixed, count) = applyFixes(field.state.content)
    if count > 0 {
      Dom.setValue(field.element, fixed)
      updateState(field.state, fixed)
      updateMetricsDisplay(field, fixed)
      totalFixes := totalFixes.contents + count
    }
  })

  totalFixes.contents
}

/** Export for userscript */
let exportUserscriptAPI = (): unit => {
  %raw(`
    window.EmptyLinterForm = {
      enhanceAll: enhanceAll,
      disableAll: disableAll,
      toggle: toggle,
      configure: configure,
      fixAllFields: fixAllFields,
      getCleanContent: getCleanContent,
      isEnabled: () => globalState.enabled
    }
  `)
}
