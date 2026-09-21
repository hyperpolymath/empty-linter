// SPDX-License-Identifier: MPL-2.0
// SPDX-FileCopyrightText: 2026 Jonathan D.A. Jewell
//
// build-fixture.js — deterministic generator for the IETF incident fixture
// (issue #74, "Originating acceptance fixture").
//
// The incident: an editor inserted a hidden formatting character into an
// Internet-Draft bound for the IETF Datatracker; the Datatracker rejected it
// repeatedly without making the offending location comprehensible.
//
// This generator writes draft-rfc-style.txt with exactly three plantings.
// Every invisible code point is written as an explicit numeric value, so the
// fixture is reviewable in a plain diff:
//
//   1. U+00A0 NO-BREAK SPACE between "network" and "layer" in the abstract —
//      the incident character itself. Mechanical: replacement with U+0020
//      cannot change the rendered text.
//   2. U+200D ZERO WIDTH JOINER inside the word "dataformats" — a SEMANTIC
//      control that the repair policy must refuse to touch even though it
//      is invisible.
//   3. A zalgo run (5 combining marks on one base character) in the
//      "artist's impression" line — suspicious combining-mark abuse:
//      flagged as ambiguous, and preserved by the default policy.
//
// Run: bun run tests/fixtures/ietf-incident/build-fixture.js
// The E2E test asserts the checked-in fixture is byte-identical to this
// generator's output, so the fixture can never silently drift.

import { writeFile } from "node:fs/promises";

const NBSP = String.fromCodePoint(0x00a0);
const ZWJ = String.fromCodePoint(0x200d);
const ZALGO = "z" + [0x0334, 0x0335, 0x0336, 0x0337, 0x0338].map((cp) => String.fromCodePoint(cp)).join("");

const RULER = "   " + "|" + " ".repeat(68) + "|";

export const FIXTURE_TEXT = `                      Network Working Group${" ".repeat(12)}|
                      Request for Comments: 9XXX${" ".repeat(12)}|
                      Category: Informational${" ".repeat(15)}|
${RULER}
                     The Transparent Layer Problem

Abstract

   This memo describes an incident in which the network${NBSP}layer of a
   submission pipeline rejected perfectly ordinary data${ZWJ}formats that
   contained no visible fault. ${ZALGO} The artist's impression, above.

1. Introduction

   The cause was invisible, and therefore unactionable.
`;

export async function buildFixture(path) {
  await writeFile(path, FIXTURE_TEXT, "utf-8");
}

if (import.meta.main) {
  const target = new URL("./draft-rfc-style.txt", import.meta.url).pathname;
  await buildFixture(target);
  const bytes = Buffer.byteLength(FIXTURE_TEXT, "utf-8");
  console.log(`fixture written: ${target} (${bytes} bytes)`);
}
