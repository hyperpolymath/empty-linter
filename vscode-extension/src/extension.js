// SPDX-License-Identifier: MPL-2.0
// Copyright (c) Jonathan D.A. Jewell <j.d.a.jewell@open.ac.uk>
// SPDX-FileCopyrightText: 2025 Hyperpolymath
//
// Empty Linter VSCode Extension
// Idris Inside - Uses proven-verified artifact detection patterns

const vscode = require('vscode');

// ═══════════════════════════════════════════════════════════════════════════════
// ARTIFACT DEFINITIONS (Proven-verified patterns)
// ═══════════════════════════════════════════════════════════════════════════════

// BEGIN GENERATED: empty-linter-artifact-table (base)
const ARTIFACTS = {
    0x0: { name: 'NULL', severity: 'critical', description: 'Null byte; corrupts many parsers and truncates C-string consumers.' },
    0xA0: { name: 'NBSP', severity: 'error', description: 'Non-breaking space; commonly paste-borne, breaks keyword/token matching and line wrapping.' },
    0xAD: { name: 'SHY', severity: 'info', description: 'Soft hyphen; invisible hyphenation hint that changes line breaking when present.' },
    0x34F: { name: 'CGJ', severity: 'warning', description: 'Combining grapheme joiner; blocks canonical reordering of combining marks. Never auto-removed.' },
    0x600: { name: 'ARABIC NUMBER SIGN', severity: 'info', description: 'Arabic number sign; changes the display of the digits it precedes.' },
    0x601: { name: 'ARABIC SIGN SANAH', severity: 'info', description: 'Arabic year sign.' },
    0x602: { name: 'ARABIC FOOTNOTE MARKER', severity: 'info', description: 'Arabic footnote marker.' },
    0x603: { name: 'ARABIC SIGN SAFHA', severity: 'info', description: 'Arabic page sign.' },
    0x604: { name: 'ARABIC SIGN SAMVAT', severity: 'info', description: 'Arabic Samvat sign.' },
    0x605: { name: 'ARABIC NUMBER MARK ABOVE', severity: 'info', description: 'Arabic number mark; may suppress rendering and place a mark above following digits.' },
    0x61C: { name: 'ALM', severity: 'info', description: 'Arabic letter mark; sets direction of adjacent punctuation in Arabic text.' },
    0x6DD: { name: 'ARABIC END OF AYAH', severity: 'info', description: 'End-of-ayah mark; Quranic text, suppresses the following digits\' glyph.' },
    0x70F: { name: 'SAM', severity: 'warning', description: 'Syriac abbreviation mark; renders following letters with an overline; abused for invisible text.' },
    0x890: { name: 'ARABIC POUND MARK ABOVE', severity: 'info', description: 'Arabic pound mark; annotates following digits.' },
    0x891: { name: 'ARABIC PIASTRE MARK ABOVE', severity: 'info', description: 'Arabic piastre mark; annotates following digits.' },
    0x8E2: { name: 'ARABIC DISPUTED END OF AYAH', severity: 'info', description: 'Arabic disputed end of ayah.' },
    0x115F: { name: 'HANGUL CHOSEONG FILLER', severity: 'info', description: 'Hangul choseong filler; meaningful in jamo composition, blank alone.' },
    0x1160: { name: 'HANGUL JUNGSEONG FILLER', severity: 'info', description: 'Hangul jungseong filler; meaningful in jamo composition, blank alone.' },
    0x1680: { name: 'OGHAM SPACE', severity: 'info', description: 'Ogham space; visible in some fonts, blank in most web fonts — frequent disguised-space abuse.' },
    0x180E: { name: 'MVS', severity: 'warning', description: 'Mongolian vowel separator; Mongolian shaping (Cf since Unicode 14).' },
    0x2000: { name: 'EN QUAD', severity: 'info', description: 'Typographic en-width space.' },
    0x2001: { name: 'EM QUAD', severity: 'info', description: 'Typographic em-width space.' },
    0x2002: { name: 'EN SPACE', severity: 'info', description: 'En-width space; polices alignment invisibly.' },
    0x2003: { name: 'EM SPACE', severity: 'info', description: 'Em-width space; polices alignment invisibly.' },
    0x2004: { name: 'THREE-PER-EM SPACE', severity: 'info', description: 'One-third em space.' },
    0x2005: { name: 'FOUR-PER-EM SPACE', severity: 'info', description: 'One-quarter em space.' },
    0x2006: { name: 'SIX-PER-EM SPACE', severity: 'info', description: 'One-sixth em space.' },
    0x2007: { name: 'FIGURE SPACE', severity: 'info', description: 'Digit-width space; silently defeats numeric column detection.' },
    0x2008: { name: 'PUNCTUATION SPACE', severity: 'info', description: 'Period-width space.' },
    0x2009: { name: 'THIN SPACE', severity: 'info', description: 'Thin space; legitimate in French typography, invisible alignment lever elsewhere.' },
    0x200A: { name: 'HAIR SPACE', severity: 'info', description: 'Narrowest typographic space.' },
    0x200B: { name: 'ZWSP', severity: 'error', description: 'Zero-width space; invisible break opportunity, frequent paste/conversion artefact.' },
    0x200C: { name: 'ZWNJ', severity: 'warning', description: 'Zero-width non-joiner; changes cursive joining and ligature formation. Never auto-removed.' },
    0x200D: { name: 'ZWJ', severity: 'warning', description: 'Zero-width joiner; builds emoji sequences and joins Indic/Arabic forms. Never auto-removed.' },
    0x200E: { name: 'LRM', severity: 'info', description: 'Left-to-right mark; directional mark that may be intentional in bidi text.' },
    0x200F: { name: 'RLM', severity: 'info', description: 'Right-to-left mark; directional mark that may be intentional in bidi text.' },
    0x2028: { name: 'LS', severity: 'warning', description: 'Unicode line separator; invisible in many editors, syntactically significant in some formats (e.g. JS strings).' },
    0x2029: { name: 'PS', severity: 'warning', description: 'Unicode paragraph separator; invisible in many editors, syntactically significant in some formats.' },
    0x202F: { name: 'NNBSP', severity: 'info', description: 'Narrow non-breaking space; required in French typography, paste artefact elsewhere.' },
    0x205F: { name: 'MMSP', severity: 'info', description: 'Medium mathematical space; 4/18-em, invisible outside math text.' },
    0x2060: { name: 'WJ', severity: 'info', description: 'Word joiner; invisible glue that suppresses line breaks at its position.' },
    0x2061: { name: 'FUNCTION APPLICATION', severity: 'warning', description: 'Invisible math operator; distinguishes f(x) from f times x in formal math.' },
    0x2062: { name: 'INVISIBLE TIMES', severity: 'warning', description: 'Invisible multiplication; semantic in mathematical text.' },
    0x2063: { name: 'INVISIBLE SEPARATOR', severity: 'warning', description: 'Invisible comma; semantic in mathematical text.' },
    0x2064: { name: 'INVISIBLE PLUS', severity: 'warning', description: 'Invisible addition; semantic in mathematical text.' },
    0x206A: { name: 'ISS', severity: 'warning', description: 'Deprecated bidi format control; Unicode deprecated, no modern consumer honours it.' },
    0x206B: { name: 'ASS', severity: 'warning', description: 'Deprecated bidi format control; Unicode deprecated.' },
    0x206C: { name: 'IAFS', severity: 'warning', description: 'Deprecated Arabic shaping control; Unicode deprecated.' },
    0x206D: { name: 'AAFS', severity: 'warning', description: 'Deprecated Arabic shaping control; Unicode deprecated.' },
    0x206E: { name: 'NADS', severity: 'warning', description: 'Deprecated digit-shaping control; Unicode deprecated.' },
    0x206F: { name: 'NODS', severity: 'warning', description: 'Deprecated digit-shaping control; Unicode deprecated.' },
    0x2800: { name: 'BRAILLE BLANK', severity: 'info', description: 'Blank braille cell; legitimate in braille output, a reliable invisible spacer elsewhere.' },
    0x3000: { name: 'IDEOGRAPHIC SPACE', severity: 'info', description: 'Full-width CJK space; normal in CJK text, a disguised invisible gap in Latin source.' },
    0x3164: { name: 'HANGUL FILLER', severity: 'warning', description: 'Hangul filler; blank-rendering letter, the classic invisible-username character.' },
    0xFEFF: { name: 'BOM', severity: 'warning', description: 'Byte order mark; only meaningful as a leading file signature, invisible elsewhere.' },
    0xFFA0: { name: 'HALFWIDTH HANGUL FILLER', severity: 'warning', description: 'Halfwidth hangul filler; blank-rendering compatibility letter.' },
    0xFFF9: { name: 'IAA', severity: 'warning', description: 'Interlinear annotation anchor; marks annotated text.' },
    0xFFFA: { name: 'IAS', severity: 'warning', description: 'Interlinear annotation separator; splits base text from annotation.' },
    0xFFFB: { name: 'IAT', severity: 'warning', description: 'Interlinear annotation terminator; ends an annotation block.' },
    0xFFFC: { name: 'ORC', severity: 'warning', description: 'Placeholder for an embedded object; removing it detaches the object it stands for.' },
    0xFFFD: { name: 'REPLACEMENT CHAR', severity: 'error', description: 'Evidence of prior encoding corruption; removing it conceals the loss. Fix the byte source instead.' },
    0xFFFE: { name: 'REVERSED BOM', severity: 'critical', description: 'U+FFFE is a permanently reserved noncharacter; its presence marks a byte-order or encoding error.' },
};
// END GENERATED

// Bidirectional control characters (security risk)
// BEGIN GENERATED: empty-linter-artifact-table (bidirectional)
const BIDI_ARTIFACTS = {
    0x202A: { name: 'LRE', severity: 'error', description: 'Bidi embedding; reorders rendered text (Trojan Source risk).' },
    0x202B: { name: 'RLE', severity: 'error', description: 'Bidi embedding; reorders rendered text (Trojan Source risk).' },
    0x202C: { name: 'PDF', severity: 'error', description: 'Pops a bidi embedding/override; its removal strands or orphans directional state.' },
    0x202D: { name: 'LRO', severity: 'critical', description: 'Bidi override; forces rendering order against logical order (CVE-2021-42574 class).' },
    0x202E: { name: 'RLO', severity: 'critical', description: 'Bidi override; forces rendering order against logical order (CVE-2021-42574 class).' },
    0x2066: { name: 'LRI', severity: 'error', description: 'Bidi isolate; legitimate in i18n UI strings, suspicious in source.' },
    0x2067: { name: 'RLI', severity: 'error', description: 'Bidi isolate; legitimate in i18n UI strings, suspicious in source.' },
    0x2068: { name: 'FSI', severity: 'error', description: 'Bidi isolate; legitimate in i18n UI strings, suspicious in source.' },
    0x2069: { name: 'PDI', severity: 'error', description: 'Pops a bidi isolate; removing it corrupts isolate pairing.' },
};
// END GENERATED

const ALL_ARTIFACTS = { ...ARTIFACTS, ...BIDI_ARTIFACTS };

// ═══════════════════════════════════════════════════════════════════════════════
// EXTENSION STATE
// ═══════════════════════════════════════════════════════════════════════════════

let diagnosticCollection;
let statusBarItem;
let highlightDecorationType;
let highlightEnabled = true;

// ═══════════════════════════════════════════════════════════════════════════════
// CORE FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scan text for invisible artifacts
 * @param {string} text - Text to scan
 * @returns {Array} Array of found artifacts with positions
 */
function scanForArtifacts(text) {
    const found = [];
    let line = 0;
    let column = 0;

    for (let i = 0; i < text.length; i++) {
        const code = text.charCodeAt(i);
        const artifact = ALL_ARTIFACTS[code];

        if (artifact) {
            found.push({
                ...artifact,
                code: code,
                hex: code.toString(16).toUpperCase().padStart(4, '0'),
                position: i,
                line: line,
                column: column,
                range: new vscode.Range(line, column, line, column + 1)
            });
        }

        if (text[i] === '\n') {
            line++;
            column = 0;
        } else {
            column++;
        }
    }

    return found;
}

/**
 * Get replacement character for an artifact
 * @param {number} code - Character code
 * @returns {string} Replacement character
 */
function getReplacementChar(code) {
    // BOM at start - remove
    if (code === 0xFEFF || code === 0xFFFE) return '';

    // NULL - remove
    if (code === 0x00) return '';

    // Zero-width characters - remove
    if (code >= 0x200B && code <= 0x200D) return '';
    if (code === 0x2060) return '';

    // Soft hyphen - remove
    if (code === 0x00AD) return '';

    // NBSP and exotic spaces - replace with regular space
    if (code === 0xA0) return ' ';
    if (code >= 0x2000 && code <= 0x200A) return ' ';
    if (code === 0x202F || code === 0x205F || code === 0x3000) return ' ';

    // Line/paragraph separators - replace with newline
    if (code === 0x2028 || code === 0x2029) return '\n';

    // Bidi controls - remove (security risk)
    if (code >= 0x202A && code <= 0x202E) return '';
    if (code >= 0x2066 && code <= 0x2069) return '';

    // Default: remove
    return '';
}

/**
 * Fix artifacts in document
 * @param {vscode.TextDocument} document - Document to fix
 * @returns {Array} Array of edits
 */
function createFixes(document) {
    const text = document.getText();
    const edits = [];
    const artifacts = scanForArtifacts(text);

    for (const artifact of artifacts) {
        const replacement = getReplacementChar(artifact.code);
        edits.push(new vscode.TextEdit(artifact.range, replacement));
    }

    return edits;
}

/**
 * Get text metrics
 * @param {string} text - Text to analyze
 * @returns {Object} Metrics object
 */
function getMetrics(text) {
    const chars = text.length;
    const charsNoWhitespace = text.replace(/\s/g, '').length;
    const words = text.trim() === '' ? 0 : text.trim().split(/\s+/).length;
    const lines = text.split('\n').length;
    const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim()).length || (text.trim() ? 1 : 0);

    return { chars, charsNoWhitespace, words, lines, paragraphs };
}

/**
 * Convert severity to VSCode DiagnosticSeverity
 * @param {string} severity - Artifact severity
 * @returns {vscode.DiagnosticSeverity} VSCode severity
 */
function toVSCodeSeverity(severity) {
    const config = vscode.workspace.getConfiguration('emptyLinter');
    const mapping = config.get(`severity.${severity}`, 'Warning');

    switch (mapping) {
        case 'Error': return vscode.DiagnosticSeverity.Error;
        case 'Warning': return vscode.DiagnosticSeverity.Warning;
        case 'Information': return vscode.DiagnosticSeverity.Information;
        case 'Hint': return vscode.DiagnosticSeverity.Hint;
        case 'Ignore': return null;
        default: return vscode.DiagnosticSeverity.Warning;
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// DIAGNOSTIC PROVIDER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Update diagnostics for a document
 * @param {vscode.TextDocument} document - Document to diagnose
 */
function updateDiagnostics(document) {
    const config = vscode.workspace.getConfiguration('emptyLinter');

    if (!config.get('enabled', true)) {
        diagnosticCollection.delete(document.uri);
        return;
    }

    // Check file type filter
    const includeTypes = config.get('includeFileTypes', []);
    if (includeTypes.length > 0 && !includeTypes.includes(document.languageId)) {
        diagnosticCollection.delete(document.uri);
        return;
    }

    const text = document.getText();
    const artifacts = scanForArtifacts(text);
    const diagnostics = [];

    for (const artifact of artifacts) {
        const vscodeSeverity = toVSCodeSeverity(artifact.severity);

        if (vscodeSeverity === null) continue;

        const diagnostic = new vscode.Diagnostic(
            artifact.range,
            `Invisible character: ${artifact.name} (U+${artifact.hex}) - ${artifact.description}`,
            vscodeSeverity
        );

        diagnostic.code = `U+${artifact.hex}`;
        diagnostic.source = 'Empty Linter';

        diagnostics.push(diagnostic);
    }

    diagnosticCollection.set(document.uri, diagnostics);

    // Update status bar
    updateStatusBar(document, artifacts.length);

    // Update highlights
    if (config.get('highlightArtifacts', true) && highlightEnabled) {
        updateHighlights(vscode.window.activeTextEditor, artifacts);
    }
}

/**
 * Update status bar item
 * @param {vscode.TextDocument} document - Current document
 * @param {number} artifactCount - Number of artifacts
 */
function updateStatusBar(document, artifactCount) {
    const config = vscode.workspace.getConfiguration('emptyLinter');

    if (!config.get('statusBar.show', true)) {
        statusBarItem.hide();
        return;
    }

    if (artifactCount > 0) {
        statusBarItem.text = `$(warning) ${artifactCount} invisible`;
        statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        statusBarItem.tooltip = `${artifactCount} invisible character${artifactCount > 1 ? 's' : ''} detected. Click to scan.`;
    } else {
        statusBarItem.text = `$(check) Clean`;
        statusBarItem.backgroundColor = undefined;
        statusBarItem.tooltip = 'No invisible characters detected';
    }

    if (config.get('statusBar.showMetrics', false)) {
        const metrics = getMetrics(document.getText());
        statusBarItem.text += ` | ${metrics.chars} chars, ${metrics.words} words`;
    }

    statusBarItem.show();
}

/**
 * Update highlight decorations
 * @param {vscode.TextEditor} editor - Editor to update
 * @param {Array} artifacts - Artifacts to highlight
 */
function updateHighlights(editor, artifacts) {
    if (!editor) return;

    const decorations = artifacts.map(artifact => ({
        range: artifact.range,
        hoverMessage: new vscode.MarkdownString(
            `**${artifact.name}** (U+${artifact.hex})\n\n${artifact.description}\n\n*Severity: ${artifact.severity}*`
        )
    }));

    editor.setDecorations(highlightDecorationType, decorations);
}

// ═══════════════════════════════════════════════════════════════════════════════
// CODE ACTION PROVIDER
// ═══════════════════════════════════════════════════════════════════════════════

class EmptyLinterCodeActionProvider {
    provideCodeActions(document, range, context) {
        const actions = [];

        // Check if we have empty linter diagnostics
        const diagnostics = context.diagnostics.filter(d => d.source === 'Empty Linter');

        if (diagnostics.length === 0) return actions;

        // Single fix action
        if (diagnostics.length === 1) {
            const diagnostic = diagnostics[0];
            const fixAction = new vscode.CodeAction(
                `Fix ${diagnostic.code}`,
                vscode.CodeActionKind.QuickFix
            );

            const artifact = scanForArtifacts(document.getText()).find(
                a => a.line === diagnostic.range.start.line && a.column === diagnostic.range.start.character
            );

            if (artifact) {
                const edit = new vscode.WorkspaceEdit();
                edit.replace(document.uri, diagnostic.range, getReplacementChar(artifact.code));
                fixAction.edit = edit;
                fixAction.diagnostics = [diagnostic];
                fixAction.isPreferred = true;
                actions.push(fixAction);
            }
        }

        // Fix all action
        const fixAllAction = new vscode.CodeAction(
            'Fix all invisible characters',
            vscode.CodeActionKind.QuickFix
        );

        const allEdits = createFixes(document);
        if (allEdits.length > 0) {
            const edit = new vscode.WorkspaceEdit();
            edit.set(document.uri, allEdits);
            fixAllAction.edit = edit;
            fixAllAction.diagnostics = diagnostics;
            actions.push(fixAllAction);
        }

        return actions;
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMMANDS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scan current document command
 */
async function scanDocument() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showWarningMessage('No active editor');
        return;
    }

    const artifacts = scanForArtifacts(editor.document.getText());

    if (artifacts.length === 0) {
        vscode.window.showInformationMessage('No invisible characters found');
    } else {
        const grouped = {};
        for (const a of artifacts) {
            grouped[a.name] = (grouped[a.name] || 0) + 1;
        }

        const summary = Object.entries(grouped)
            .map(([name, count]) => `${name}: ${count}`)
            .join(', ');

        const result = await vscode.window.showWarningMessage(
            `Found ${artifacts.length} invisible character(s): ${summary}`,
            'Fix All',
            'Show Details'
        );

        if (result === 'Fix All') {
            await fixDocument();
        } else if (result === 'Show Details') {
            showArtifactDetails(artifacts);
        }
    }
}

/**
 * Fix current document command
 */
async function fixDocument() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showWarningMessage('No active editor');
        return;
    }

    const edits = createFixes(editor.document);

    if (edits.length === 0) {
        vscode.window.showInformationMessage('No invisible characters to fix');
        return;
    }

    const edit = new vscode.WorkspaceEdit();
    edit.set(editor.document.uri, edits);
    await vscode.workspace.applyEdit(edit);

    vscode.window.showInformationMessage(`Fixed ${edits.length} invisible character(s)`);
}

/**
 * Scan workspace command
 */
async function scanWorkspace() {
    const config = vscode.workspace.getConfiguration('emptyLinter');
    const excludePatterns = config.get('excludePatterns', []);

    const files = await vscode.workspace.findFiles(
        '**/*',
        `{${excludePatterns.join(',')}}`
    );

    let totalArtifacts = 0;
    const fileResults = [];

    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Scanning workspace for invisible characters...',
        cancellable: true
    }, async (progress, token) => {
        for (let i = 0; i < files.length; i++) {
            if (token.isCancellationRequested) break;

            progress.report({
                increment: (100 / files.length),
                message: `${i + 1}/${files.length} files`
            });

            try {
                const document = await vscode.workspace.openTextDocument(files[i]);
                const artifacts = scanForArtifacts(document.getText());

                if (artifacts.length > 0) {
                    totalArtifacts += artifacts.length;
                    fileResults.push({
                        file: files[i],
                        count: artifacts.length
                    });
                }
            } catch (e) {
                // Skip files that can't be opened as text
            }
        }
    });

    if (totalArtifacts === 0) {
        vscode.window.showInformationMessage('No invisible characters found in workspace');
    } else {
        const result = await vscode.window.showWarningMessage(
            `Found ${totalArtifacts} invisible characters in ${fileResults.length} files`,
            'Show Files'
        );

        if (result === 'Show Files') {
            const items = fileResults.map(r => ({
                label: vscode.workspace.asRelativePath(r.file),
                description: `${r.count} character(s)`,
                file: r.file
            }));

            const selected = await vscode.window.showQuickPick(items, {
                placeHolder: 'Select file to open'
            });

            if (selected) {
                const doc = await vscode.workspace.openTextDocument(selected.file);
                await vscode.window.showTextDocument(doc);
            }
        }
    }
}

/**
 * Toggle highlight command
 */
function toggleHighlight() {
    highlightEnabled = !highlightEnabled;

    if (highlightEnabled) {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            const artifacts = scanForArtifacts(editor.document.getText());
            updateHighlights(editor, artifacts);
        }
        vscode.window.showInformationMessage('Artifact highlighting enabled');
    } else {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            editor.setDecorations(highlightDecorationType, []);
        }
        vscode.window.showInformationMessage('Artifact highlighting disabled');
    }
}

/**
 * Show metrics command
 */
function showMetrics() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showWarningMessage('No active editor');
        return;
    }

    const metrics = getMetrics(editor.document.getText());

    vscode.window.showInformationMessage(
        `Characters: ${metrics.chars} (${metrics.charsNoWhitespace} without whitespace) | ` +
        `Words: ${metrics.words} | Lines: ${metrics.lines} | Paragraphs: ${metrics.paragraphs}`
    );
}

/**
 * Show artifact details in output panel
 * @param {Array} artifacts - Artifacts to display
 */
function showArtifactDetails(artifacts) {
    const outputChannel = vscode.window.createOutputChannel('Empty Linter');

    outputChannel.clear();
    outputChannel.appendLine('═══════════════════════════════════════════════════════════════════════════════');
    outputChannel.appendLine('  EMPTY LINTER - Invisible Character Report');
    outputChannel.appendLine('═══════════════════════════════════════════════════════════════════════════════');
    outputChannel.appendLine('');

    const grouped = {};
    for (const a of artifacts) {
        if (!grouped[a.severity]) grouped[a.severity] = [];
        grouped[a.severity].push(a);
    }

    for (const severity of ['critical', 'error', 'warning', 'info']) {
        if (grouped[severity]) {
            outputChannel.appendLine(`[${severity.toUpperCase()}]`);
            outputChannel.appendLine('─'.repeat(40));

            for (const a of grouped[severity]) {
                outputChannel.appendLine(
                    `  Line ${a.line + 1}, Col ${a.column + 1}: ${a.name} (U+${a.hex})`
                );
                outputChannel.appendLine(`    ${a.description}`);
            }

            outputChannel.appendLine('');
        }
    }

    outputChannel.appendLine('═══════════════════════════════════════════════════════════════════════════════');
    outputChannel.appendLine(`  Total: ${artifacts.length} invisible character(s)`);
    outputChannel.appendLine('═══════════════════════════════════════════════════════════════════════════════');

    outputChannel.show();
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXTENSION LIFECYCLE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Activate extension
 * @param {vscode.ExtensionContext} context - Extension context
 */
function activate(context) {
    console.log('Empty Linter activated');

    // Create diagnostic collection
    diagnosticCollection = vscode.languages.createDiagnosticCollection('emptyLinter');
    context.subscriptions.push(diagnosticCollection);

    // Create status bar item
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.command = 'emptyLinter.scanDocument';
    context.subscriptions.push(statusBarItem);

    // Create highlight decoration type
    highlightDecorationType = vscode.window.createTextEditorDecorationType({
        backgroundColor: 'rgba(255, 150, 0, 0.3)',
        border: '1px solid rgba(255, 150, 0, 0.8)',
        borderRadius: '2px'
    });
    context.subscriptions.push(highlightDecorationType);

    // Register code action provider
    context.subscriptions.push(
        vscode.languages.registerCodeActionsProvider(
            { scheme: 'file' },
            new EmptyLinterCodeActionProvider(),
            { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] }
        )
    );

    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('emptyLinter.scanDocument', scanDocument),
        vscode.commands.registerCommand('emptyLinter.fixDocument', fixDocument),
        vscode.commands.registerCommand('emptyLinter.scanWorkspace', scanWorkspace),
        vscode.commands.registerCommand('emptyLinter.toggleHighlight', toggleHighlight),
        vscode.commands.registerCommand('emptyLinter.showMetrics', showMetrics)
    );

    // Register event handlers
    const config = vscode.workspace.getConfiguration('emptyLinter');

    if (config.get('scanOnOpen', true)) {
        context.subscriptions.push(
            vscode.window.onDidChangeActiveTextEditor(editor => {
                if (editor) {
                    updateDiagnostics(editor.document);
                }
            })
        );

        context.subscriptions.push(
            vscode.workspace.onDidOpenTextDocument(document => {
                updateDiagnostics(document);
            })
        );
    }

    if (config.get('scanOnSave', true)) {
        context.subscriptions.push(
            vscode.workspace.onDidSaveTextDocument(document => {
                updateDiagnostics(document);

                // Auto-fix if enabled
                if (config.get('autoFix', false)) {
                    fixDocument();
                }
            })
        );
    }

    // Also scan on text change (with debounce)
    let changeTimeout;
    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument(event => {
            clearTimeout(changeTimeout);
            changeTimeout = setTimeout(() => {
                if (vscode.window.activeTextEditor &&
                    event.document === vscode.window.activeTextEditor.document) {
                    updateDiagnostics(event.document);
                }
            }, 500);
        })
    );

    // Initial scan of active editor
    if (vscode.window.activeTextEditor) {
        updateDiagnostics(vscode.window.activeTextEditor.document);
    }
}

/**
 * Deactivate extension
 */
function deactivate() {
    console.log('Empty Linter deactivated');
}

module.exports = { activate, deactivate };
