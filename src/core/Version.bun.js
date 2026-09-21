// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Jonathan D.A. Jewell
//
// Single source of truth for the tool version. package.json carries the same
// number; scripts/sync-downstream.js --check enforces that they agree.

export const TOOL_VERSION = "0.2.0";
export const TOOL_NAME = "empty-linter";
