// ==UserScript==
// @name         Empty Linter - Form Enhancer
// @namespace    https://hyperpolymath.com/
// @version      0.1.0
// @description  Detect and fix invisible Unicode artifacts in form fields
// @author       Hyperpolymath
// @match        *://*/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @license      MPL-2.0
// @icon         data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🔍</text></svg>
// @downloadURL  https://github.com/hyperpolymath/empty-linter/raw/main/userscript/empty-linter.user.js
// @updateURL    https://github.com/hyperpolymath/empty-linter/raw/main/userscript/empty-linter.user.js
// ==/UserScript==

// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2025 Hyperpolymath
//
// Empty Linter Userscript - Greasemonkey/Tampermonkey compatible
// Idris Inside - Uses proven library for safe operations

(function() {
    'use strict';

    // ═══════════════════════════════════════════════════════════════════════════════
    // CONFIGURATION
    // ═══════════════════════════════════════════════════════════════════════════════

    const DEFAULT_CONFIG = {
        enabled: true,
        showMetrics: true,
        autoFix: false,
        highlightArtifacts: true,
        notifyOnPaste: true,
        workspaces: {
            twitter: { maxChars: 280 },
            linkedin: { maxChars: 3000, maxWords: 500 },
            github: { maxChars: 65536 },
            jira: { maxChars: 32767 },
            email: { maxChars: 10000 }
        }
    };

    // ═══════════════════════════════════════════════════════════════════════════════
    // ARTIFACT DETECTION (Proven-verified patterns)
    // ═══════════════════════════════════════════════════════════════════════════════

    const ARTIFACTS = {
        // Critical - Always problematic
        0x00: { name: 'NULL', severity: 'critical' },
        0xFEFF: { name: 'BOM', severity: 'critical' },
        0xFFFE: { name: 'Reversed BOM', severity: 'critical' },

        // Error - Usually unwanted
        0xA0: { name: 'NBSP', severity: 'error' },
        0x200B: { name: 'ZWSP', severity: 'error' },
        0x200C: { name: 'ZWNJ', severity: 'error' },
        0x200D: { name: 'ZWJ', severity: 'error' },
        0x2060: { name: 'Word Joiner', severity: 'error' },

        // Warning - Context dependent
        0x00AD: { name: 'Soft Hyphen', severity: 'warning' },
        0x034F: { name: 'CGJ', severity: 'warning' },
        0x061C: { name: 'ALM', severity: 'warning' },
        0x180E: { name: 'MVS', severity: 'warning' },
        0x2028: { name: 'Line Separator', severity: 'warning' },
        0x2029: { name: 'Paragraph Separator', severity: 'warning' },

        // Info - Whitespace variants
        0x2000: { name: 'En Quad', severity: 'info' },
        0x2001: { name: 'Em Quad', severity: 'info' },
        0x2002: { name: 'En Space', severity: 'info' },
        0x2003: { name: 'Em Space', severity: 'info' },
        0x2004: { name: 'Three-Per-Em Space', severity: 'info' },
        0x2005: { name: 'Four-Per-Em Space', severity: 'info' },
        0x2006: { name: 'Six-Per-Em Space', severity: 'info' },
        0x2007: { name: 'Figure Space', severity: 'info' },
        0x2008: { name: 'Punctuation Space', severity: 'info' },
        0x2009: { name: 'Thin Space', severity: 'info' },
        0x200A: { name: 'Hair Space', severity: 'info' },
        0x202F: { name: 'NNBSP', severity: 'info' },
        0x205F: { name: 'MMSP', severity: 'info' },
        0x3000: { name: 'Ideographic Space', severity: 'info' }
    };

    // ═══════════════════════════════════════════════════════════════════════════════
    // CORE FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════════

    /**
     * Scan text for invisible artifacts
     * @param {string} text - Text to scan
     * @returns {Array} Array of found artifacts
     */
    function scanForArtifacts(text) {
        const found = [];
        let line = 1;
        let column = 1;

        for (let i = 0; i < text.length; i++) {
            const code = text.charCodeAt(i);
            const artifact = ARTIFACTS[code];

            if (artifact) {
                found.push({
                    ...artifact,
                    code: code,
                    hex: code.toString(16).toUpperCase().padStart(4, '0'),
                    position: i,
                    line: line,
                    column: column
                });
            }

            if (text[i] === '\n') {
                line++;
                column = 1;
            } else {
                column++;
            }
        }

        return found;
    }

    /**
     * Fix artifacts in text by replacing with safe equivalents
     * @param {string} text - Text to fix
     * @returns {Object} { fixed: string, count: number }
     */
    function fixArtifacts(text) {
        let fixed = text;
        let count = 0;

        // Remove BOM
        if (fixed.charCodeAt(0) === 0xFEFF) {
            fixed = fixed.slice(1);
            count++;
        }

        // Replace NULL bytes
        const nullCount = (fixed.match(/\x00/g) || []).length;
        fixed = fixed.replace(/\x00/g, '');
        count += nullCount;

        // Replace NBSP with regular space
        const nbspCount = (fixed.match(/\xA0/g) || []).length;
        fixed = fixed.replace(/\xA0/g, ' ');
        count += nbspCount;

        // Remove zero-width characters
        const zwCount = (fixed.match(/[\u200B-\u200D\u2060\uFEFF]/g) || []).length;
        fixed = fixed.replace(/[\u200B-\u200D\u2060\uFEFF]/g, '');
        count += zwCount;

        // Replace exotic spaces with regular space
        const exoticSpaceRegex = /[\u2000-\u200A\u202F\u205F\u3000]/g;
        const exoticCount = (fixed.match(exoticSpaceRegex) || []).length;
        fixed = fixed.replace(exoticSpaceRegex, ' ');
        count += exoticCount;

        // Remove soft hyphens
        const shyCount = (fixed.match(/\xAD/g) || []).length;
        fixed = fixed.replace(/\xAD/g, '');
        count += shyCount;

        // Replace line/paragraph separators with newline
        const sepCount = (fixed.match(/[\u2028\u2029]/g) || []).length;
        fixed = fixed.replace(/[\u2028\u2029]/g, '\n');
        count += sepCount;

        return { fixed, count };
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
     * Escape HTML for safe rendering
     * @param {string} str - String to escape
     * @returns {string} Escaped string
     */
    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    // UI COMPONENTS
    // ═══════════════════════════════════════════════════════════════════════════════

    const STYLES = `
        .el-metrics {
            font-size: 12px;
            color: #6b7280;
            margin-top: 4px;
            display: flex;
            justify-content: space-between;
            padding: 4px 8px;
            background: #f9fafb;
            border-radius: 4px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }
        .el-metrics-value {
            font-weight: 600;
            color: #374151;
        }
        .el-metrics-over {
            color: #ef4444;
            font-weight: 700;
        }
        .el-artifact-badge {
            display: inline-block;
            padding: 1px 6px;
            border-radius: 3px;
            font-size: 10px;
            font-weight: 600;
            text-transform: uppercase;
            margin-left: 4px;
        }
        .el-badge-critical { background: #ef4444; color: white; }
        .el-badge-error { background: #f97316; color: white; }
        .el-badge-warning { background: #eab308; color: white; }
        .el-badge-info { background: #0ea5e9; color: white; }
        .el-notification {
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: #1f2937;
            color: white;
            padding: 12px 20px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            z-index: 999999;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-size: 14px;
            max-width: 400px;
            animation: el-slide-in 0.3s ease;
        }
        .el-notification-warning {
            background: #f97316;
        }
        .el-notification-error {
            background: #ef4444;
        }
        @keyframes el-slide-in {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
        .el-field-enhanced {
            transition: border-color 0.2s, box-shadow 0.2s;
        }
        .el-field-warning {
            border-color: #f97316 !important;
            box-shadow: 0 0 0 2px rgba(249, 115, 22, 0.2) !important;
        }
        .el-field-error {
            border-color: #ef4444 !important;
            box-shadow: 0 0 0 2px rgba(239, 68, 68, 0.2) !important;
        }
    `;

    /**
     * Create metrics display element
     * @param {Object} metrics - Metrics object
     * @param {Object} constraints - Optional constraints
     * @returns {HTMLElement}
     */
    function createMetricsElement(metrics, constraints = null) {
        const el = document.createElement('div');
        el.className = 'el-metrics';

        let charDisplay = `<span class="el-metrics-value">${metrics.chars}</span>`;
        if (constraints && constraints.maxChars) {
            const isOver = metrics.chars > constraints.maxChars;
            const cls = isOver ? 'el-metrics-over' : 'el-metrics-value';
            charDisplay = `<span class="${cls}">${metrics.chars}</span>/${constraints.maxChars}`;
        }

        let wordDisplay = `<span class="el-metrics-value">${metrics.words}</span>`;
        if (constraints && constraints.maxWords) {
            const isOver = metrics.words > constraints.maxWords;
            const cls = isOver ? 'el-metrics-over' : 'el-metrics-value';
            wordDisplay = `<span class="${cls}">${metrics.words}</span>/${constraints.maxWords}`;
        }

        el.innerHTML = `
            <span>Chars: ${charDisplay}</span>
            <span>Words: ${wordDisplay}</span>
            <span>Lines: <span class="el-metrics-value">${metrics.lines}</span></span>
        `;

        return el;
    }

    /**
     * Show notification
     * @param {string} message - Message to show
     * @param {string} type - 'info' | 'warning' | 'error'
     * @param {number} duration - Duration in ms
     */
    function showNotification(message, type = 'info', duration = 3000) {
        const existing = document.querySelector('.el-notification');
        if (existing) existing.remove();

        const el = document.createElement('div');
        el.className = `el-notification el-notification-${type}`;
        el.innerHTML = message;
        document.body.appendChild(el);

        setTimeout(() => {
            el.style.animation = 'el-slide-in 0.3s ease reverse';
            setTimeout(() => el.remove(), 300);
        }, duration);
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    // FORM ENHANCER
    // ═══════════════════════════════════════════════════════════════════════════════

    const enhancedFields = new WeakMap();

    /**
     * Detect workspace from URL/page context
     * @returns {string|null} Workspace name or null
     */
    function detectWorkspace() {
        const host = window.location.hostname;

        if (host.includes('twitter.com') || host.includes('x.com')) return 'twitter';
        if (host.includes('linkedin.com')) return 'linkedin';
        if (host.includes('github.com')) return 'github';
        if (host.includes('jira') || host.includes('atlassian')) return 'jira';
        if (host.includes('mail') || host.includes('outlook') || host.includes('gmail')) return 'email';

        return null;
    }

    /**
     * Get constraints for element
     * @param {HTMLElement} element - Form element
     * @returns {Object} Constraints
     */
    function getConstraints(element) {
        const workspace = detectWorkspace();
        const config = getConfig();
        let constraints = {};

        // Check workspace constraints
        if (workspace && config.workspaces[workspace]) {
            constraints = { ...config.workspaces[workspace] };
        }

        // Override with element attributes
        const maxLength = element.getAttribute('maxlength');
        if (maxLength) constraints.maxChars = parseInt(maxLength, 10);

        const minLength = element.getAttribute('minlength');
        if (minLength) constraints.minChars = parseInt(minLength, 10);

        return constraints;
    }

    /**
     * Enhance a single form field
     * @param {HTMLElement} element - Form element
     */
    function enhanceField(element) {
        if (enhancedFields.has(element)) return;

        const config = getConfig();
        if (!config.enabled) return;

        const constraints = getConstraints(element);

        // Create metrics container
        const metricsContainer = document.createElement('div');
        metricsContainer.style.cssText = 'margin-top: 4px;';

        // Insert after element
        element.parentNode.insertBefore(metricsContainer, element.nextSibling);

        // Store enhancement data
        const data = {
            metricsContainer,
            constraints,
            originalBorder: element.style.borderColor
        };
        enhancedFields.set(element, data);

        element.classList.add('el-field-enhanced');

        // Update function
        const update = () => {
            const content = element.value;
            const metrics = getMetrics(content);
            const artifacts = scanForArtifacts(content);

            // Update metrics display
            if (config.showMetrics) {
                metricsContainer.innerHTML = '';
                metricsContainer.appendChild(createMetricsElement(metrics, constraints));

                // Add artifact warning
                if (artifacts.length > 0 && config.highlightArtifacts) {
                    const warning = document.createElement('div');
                    warning.style.cssText = 'color: #f97316; font-size: 12px; margin-top: 4px;';
                    warning.innerHTML = `⚠ ${artifacts.length} invisible character${artifacts.length > 1 ? 's' : ''} detected`;
                    metricsContainer.appendChild(warning);
                }
            }

            // Update field styling
            element.classList.remove('el-field-warning', 'el-field-error');

            const isOverLimit = constraints.maxChars && metrics.chars > constraints.maxChars;
            const hasArtifacts = artifacts.length > 0;

            if (isOverLimit) {
                element.classList.add('el-field-error');
            } else if (hasArtifacts) {
                element.classList.add('el-field-warning');
            }
        };

        // Event listeners
        element.addEventListener('input', update);
        element.addEventListener('change', update);

        // Paste listener for auto-fix
        element.addEventListener('paste', (e) => {
            if (config.autoFix) {
                setTimeout(() => {
                    const { fixed, count } = fixArtifacts(element.value);
                    if (count > 0) {
                        element.value = fixed;
                        update();
                        if (config.notifyOnPaste) {
                            showNotification(`Fixed ${count} invisible character${count > 1 ? 's' : ''}`, 'info');
                        }
                    }
                }, 0);
            } else if (config.notifyOnPaste) {
                setTimeout(() => {
                    const artifacts = scanForArtifacts(element.value);
                    if (artifacts.length > 0) {
                        showNotification(
                            `⚠ Pasted text contains ${artifacts.length} invisible character${artifacts.length > 1 ? 's' : ''}`,
                            'warning'
                        );
                    }
                }, 0);
            }
        });

        // Initial update
        update();
    }

    /**
     * Remove enhancement from field
     * @param {HTMLElement} element - Form element
     */
    function removeEnhancement(element) {
        const data = enhancedFields.get(element);
        if (!data) return;

        data.metricsContainer.remove();
        element.classList.remove('el-field-enhanced', 'el-field-warning', 'el-field-error');
        enhancedFields.delete(element);
    }

    /**
     * Enhance all text fields on page
     */
    function enhanceAllFields() {
        const textareas = document.querySelectorAll('textarea');
        const textInputs = document.querySelectorAll('input[type="text"], input:not([type])');

        textareas.forEach(enhanceField);
        textInputs.forEach(enhanceField);
    }

    /**
     * Remove all enhancements
     */
    function removeAllEnhancements() {
        document.querySelectorAll('.el-field-enhanced').forEach(removeEnhancement);
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    // CONFIGURATION MANAGEMENT
    // ═══════════════════════════════════════════════════════════════════════════════

    /**
     * Get configuration
     * @returns {Object} Config object
     */
    function getConfig() {
        try {
            const stored = GM_getValue('config', null);
            if (stored) {
                return { ...DEFAULT_CONFIG, ...JSON.parse(stored) };
            }
        } catch (e) {
            console.warn('[Empty Linter] Failed to load config:', e);
        }
        return DEFAULT_CONFIG;
    }

    /**
     * Save configuration
     * @param {Object} config - Config to save
     */
    function saveConfig(config) {
        try {
            GM_setValue('config', JSON.stringify(config));
        } catch (e) {
            console.warn('[Empty Linter] Failed to save config:', e);
        }
    }

    /**
     * Toggle enabled state
     */
    function toggleEnabled() {
        const config = getConfig();
        config.enabled = !config.enabled;
        saveConfig(config);

        if (config.enabled) {
            enhanceAllFields();
            showNotification('Empty Linter enabled', 'info');
        } else {
            removeAllEnhancements();
            showNotification('Empty Linter disabled', 'info');
        }
    }

    /**
     * Toggle auto-fix
     */
    function toggleAutoFix() {
        const config = getConfig();
        config.autoFix = !config.autoFix;
        saveConfig(config);
        showNotification(`Auto-fix ${config.autoFix ? 'enabled' : 'disabled'}`, 'info');
    }

    /**
     * Fix all fields now
     */
    function fixAllFieldsNow() {
        let totalFixed = 0;

        document.querySelectorAll('textarea, input[type="text"], input:not([type])').forEach(element => {
            const { fixed, count } = fixArtifacts(element.value);
            if (count > 0) {
                element.value = fixed;
                element.dispatchEvent(new Event('input', { bubbles: true }));
                totalFixed += count;
            }
        });

        if (totalFixed > 0) {
            showNotification(`Fixed ${totalFixed} invisible character${totalFixed > 1 ? 's' : ''}`, 'info');
        } else {
            showNotification('No invisible characters found', 'info');
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    // INITIALIZATION
    // ═══════════════════════════════════════════════════════════════════════════════

    /**
     * Initialize userscript
     */
    function init() {
        // Inject styles
        const styleEl = document.createElement('style');
        styleEl.textContent = STYLES;
        document.head.appendChild(styleEl);

        // Register menu commands
        if (typeof GM_registerMenuCommand === 'function') {
            GM_registerMenuCommand('Toggle Empty Linter', toggleEnabled);
            GM_registerMenuCommand('Toggle Auto-Fix', toggleAutoFix);
            GM_registerMenuCommand('Fix All Fields Now', fixAllFieldsNow);
        }

        // Initial enhancement
        const config = getConfig();
        if (config.enabled) {
            // Wait for page to be ready
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', enhanceAllFields);
            } else {
                enhanceAllFields();
            }

            // Watch for dynamically added fields
            const observer = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    mutation.addedNodes.forEach((node) => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            if (node.matches && (node.matches('textarea') || node.matches('input[type="text"]') || node.matches('input:not([type])'))) {
                                enhanceField(node);
                            }
                            // Check descendants
                            node.querySelectorAll && node.querySelectorAll('textarea, input[type="text"], input:not([type])').forEach(enhanceField);
                        }
                    });
                });
            });

            observer.observe(document.body, { childList: true, subtree: true });
        }

        // Export API for console/other scripts
        window.EmptyLinter = {
            scan: scanForArtifacts,
            fix: fixArtifacts,
            getMetrics,
            enhanceField,
            removeEnhancement,
            enhanceAllFields,
            removeAllEnhancements,
            toggleEnabled,
            toggleAutoFix,
            fixAllFieldsNow,
            getConfig,
            saveConfig,
            ARTIFACTS
        };

        console.log('[Empty Linter] Initialized. Use window.EmptyLinter API or menu commands.');
    }

    // Run initialization
    init();
})();
