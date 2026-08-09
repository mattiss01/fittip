#!/usr/bin/env node
/**
 * Renders WORKSHEET.md as a readable comparison page.
 *
 * `worksheet.mjs` answers "did it hold the contract". This answers the question
 * the mechanical gate cannot: *would you follow this plan*. Gate 2 is the
 * product owner reading coaching prose, and nobody reads coaching prose out of
 * a JSON blob.
 *
 * The week is aligned by date across models, because the interesting difference
 * is rarely inside one session — it is that one model put five sessions in the
 * week and another put seven.
 *
 * Watch words are highlighted inline. This is deliberate and it is not the same
 * thing as a probe: the probes are regexes over free text and free text says
 * what it is *not* doing, so a highlight lets a reader see in one glance
 * whether a probe caught a real proposal or the word "no" in front of it.
 *
 *   node render.mjs
 *   node render.mjs --file WORKSHEET.md --out results/reader.html
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { runProbes, validate } from "./evaluate.mjs";
import { getScenario } from "./scenarios/index.mjs";
import {
  extractSlots,
  extractLabels,
  extractNotes,
  parseJson,
} from "./parse-worksheet.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};

const FILE = join(HERE, flag("--file", "WORKSHEET.md"));
const OUT = join(HERE, flag("--out", "results/reader.html"));

const source = readFileSync(FILE, "utf8");
const labels = extractLabels(source);
const notes = extractNotes(source);
const slots = extractSlots(source);

if (slots.length === 0) {
  console.error(`No slot markers found in ${FILE}.`);
  process.exit(1);
}

// --- watch words -----------------------------------------------------------
// Not a scoring device. These mark the vocabulary the injury and safety probes
// key on, so a reader can see the matched span rather than trusting a verdict.

// Sources use non-capturing groups so they can be combined into one alternation
// below with one capture group per entry and predictable group indices.
const WATCH = [
  {
    id: "swim",
    label: "swimming",
    source: String.raw`\b(?:swims?|swimming|pool)\b`,
  },
  {
    id: "overhead",
    label: "overhead load",
    source: String.raw`\b(?:overhead|press|pull-?ups?|chin-?ups?|snatch|jerk|dips?|lat pulldown|butterfly|backstroke)\b`,
  },
  {
    id: "diagnosis",
    label: "diagnostic term",
    source: String.raw`\b(?:tendinitis|tendinopathy|tendonitis|strains?|tears?|sprains?|itbs|diagnos\w*)\b`,
  },
  {
    id: "professional",
    label: "professional referral",
    source: String.raw`\b(?:physio|physiotherapist|clinician|doctor|gp|medical|professional|specialist)\b`,
  },
];

const COMBINED = new RegExp(WATCH.map((w) => `(${w.source})`).join("|"), "gi");

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/**
 * Wrap every watch-word hit in a tagged mark.
 *
 * One pass, not one pass per word: marking in sequence lets a later word match
 * inside the markup an earlier one inserted — the attribute `class="w w-swim"`
 * contains `swim` between two word boundaries.
 */
function highlight(text) {
  return escapeHtml(text).replace(COMBINED, (match, ...rest) => {
    const groups = rest.slice(0, WATCH.length);
    const index = groups.findIndex((group) => group !== undefined);
    const word = WATCH[index] ?? WATCH[0];
    return `<mark class="w w-${word.id}">${match}</mark>`;
  });
}

// --- assemble --------------------------------------------------------------

const results = slots.map((entry) => {
  const scenario = getScenario(entry.scenario);
  const skipped = entry.body === "";
  const { parsed, error } = skipped
    ? { parsed: null, error: null }
    : parseJson(entry.body);
  const failures = skipped
    ? []
    : parsed
      ? validate(entry.operation, parsed, scenario)
      : [error];
  return {
    slot: entry.slot,
    label: labels[entry.slot] || `slot ${entry.slot}`,
    scenario: entry.scenario,
    scenarioMeta: scenario,
    operation: entry.operation,
    skipped,
    parsed,
    failures,
    probes: parsed ? runProbes(entry.operation, parsed, scenario) : null,
  };
});

const slotOrder = [...new Set(slots.map((s) => s.slot))];
const scenarioOrder = [...new Set(slots.map((s) => s.scenario))];

const goalTitle = (scenario, goalId) => {
  const goals = [
    ...(scenario?.context?.targetableGoals ?? []),
    ...(scenario?.context?.historicalGoals ?? []),
  ];
  return goals.find((g) => g.id === goalId)?.title ?? null;
};

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const weekdayOf = (iso) =>
  WEEKDAYS[new Date(`${iso}T00:00:00Z`).getUTCDay()] ?? "";
const addDays = (iso, n) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

// --- render pieces ---------------------------------------------------------

function probeStrip(result) {
  if (!result.probes) return "";
  const chips = result.probes
    .map((p) => {
      const state = p.passed
        ? "pass"
        : p.advisory
          ? "advisory"
          : p.mustPass
            ? "fail"
            : "soft";
      const mark = p.passed ? "✓" : "✗";
      const flag = p.mustPass
        ? '<span class="chip-must" title="must pass">!</span>'
        : p.advisory
          ? '<span class="chip-adv" title="advisory — reported, never disqualifying">†</span>'
          : "";
      return `<li class="chip chip-${state}"><span class="chip-mark">${mark}</span>${escapeHtml(p.label)}${flag}</li>`;
    })
    .join("");
  return `<ul class="chips">${chips}</ul>`;
}

function contractLine(result) {
  if (result.skipped) return `<p class="contract none">not filled in</p>`;
  if (!result.parsed)
    return `<p class="contract bad">${escapeHtml(result.failures[0] ?? "unparseable")}</p>`;
  if (result.failures.length === 0)
    return `<p class="contract ok">contract held</p>`;
  return `<p class="contract bad">${result.failures.map(escapeHtml).join("<br>")}</p>`;
}

function sessionCell(session, scenario) {
  if (!session) return `<div class="cell rest"><span>rest</span></div>`;
  const goal = goalTitle(scenario, session.goalId);
  const minutes = session.durationMinutes;
  return `<div class="cell">
    <h4>${highlight(session.title)}</h4>
    <p class="meta">${minutes ? `${escapeHtml(minutes)} min` : ""}${goal ? `<span class="goal">${escapeHtml(goal)}</span>` : ""}</p>
    <p class="intent">${highlight(session.intent)}</p>
  </div>`;
}

function planTable(scenarioName) {
  const scenario = getScenario(scenarioName);
  const rows = results.filter(
    (r) =>
      r.scenario === scenarioName && r.operation === "create_seven_day_plan",
  );
  if (rows.length === 0) return "";
  const ordered = slotOrder
    .map((s) => rows.find((r) => r.slot === s))
    .filter(Boolean);

  const window = Array.from({ length: 7 }, (_, i) =>
    addDays(scenario.today, i + 1),
  );
  const extra = [
    ...new Set(
      ordered.flatMap((r) =>
        (r.parsed?.sessions ?? [])
          .map((s) => s.date)
          .filter((d) => d && !window.includes(d)),
      ),
    ),
  ].sort();
  const dates = [...window, ...extra];

  const head = ordered
    .map(
      (r) => `<div class="col-head">
        <p class="slot">${escapeHtml(r.slot)}</p>
        <h3>${escapeHtml(r.label)}</h3>
        ${contractLine(r)}
        <p class="load">${r.parsed?.sessions?.length ?? 0} sessions · ${(r.parsed?.sessions ?? []).reduce((t, s) => t + (Number(s.durationMinutes) || 0), 0)} min</p>
        ${probeStrip(r)}
      </div>`,
    )
    .join("");

  const body = dates
    .map((date) => {
      const outside = !window.includes(date);
      const cells = ordered
        .map((r) => {
          const found = (r.parsed?.sessions ?? []).filter(
            (s) => s.date === date,
          );
          if (found.length === 0) return sessionCell(null, scenario);
          return found.map((s) => sessionCell(s, scenario)).join("");
        })
        .join("");
      return `<div class="day-label${outside ? " outside" : ""}">
          <span class="wd">${escapeHtml(weekdayOf(date))}</span>
          <span class="dt">${escapeHtml(date)}</span>
          ${outside ? `<span class="badge-out">outside the window</span>` : ""}
        </div>${cells}`;
    })
    .join("");

  return `<div class="matrix-scroll"><div class="matrix" style="--cols:${ordered.length}">
      <div class="col-head corner">the week</div>${head}${body}
    </div></div>`;
}

function roadmapBlock(scenarioName) {
  const scenario = getScenario(scenarioName);
  const rows = results.filter(
    (r) => r.scenario === scenarioName && r.operation === "create_roadmap",
  );
  if (rows.length === 0) return "";
  const ordered = slotOrder
    .map((s) => rows.find((r) => r.slot === s))
    .filter(Boolean);

  const cards = ordered
    .map((r) => {
      const phases = (r.parsed?.phases ?? [])
        .map((p) => {
          const goal = goalTitle(scenario, p.goalId);
          return `<li>
            <p class="phase-dates">${escapeHtml(p.startDate)} → ${escapeHtml(p.endDate)}</p>
            <h4>${highlight(p.title)}</h4>
            ${goal ? `<p class="meta"><span class="goal">${escapeHtml(goal)}</span></p>` : ""}
            <p class="intent">${highlight(p.focus)}</p>
          </li>`;
        })
        .join("");
      return `<article class="roadmap-card">
        <p class="slot">${escapeHtml(r.slot)}</p>
        <h3>${escapeHtml(r.label)}</h3>
        ${contractLine(r)}
        ${probeStrip(r)}
        ${r.parsed?.summary ? `<p class="summary">${highlight(r.parsed.summary)}</p>` : ""}
        <ol class="phases">${phases}</ol>
      </article>`;
    })
    .join("");

  return `<div class="roadmaps">${cards}</div>`;
}

const legend = WATCH.map(
  (w) => `<li><mark class="w w-${w.id}">${escapeHtml(w.label)}</mark></li>`,
).join("");

const sections = scenarioOrder
  .map((name) => {
    const scenario = getScenario(name);
    return `<section class="scenario">
      <header class="scenario-head">
        <h2>${escapeHtml(scenario.title ?? name)}</h2>
        <p class="purpose">${escapeHtml(scenario.purpose ?? "")}</p>
        ${scenario.context?.planningNote ? `<blockquote class="note"><p>${highlight(scenario.context.planningNote)}</p><cite>the athlete's planning note</cite></blockquote>` : ""}
      </header>
      <h3 class="op">The week</h3>
      ${planTable(name)}
      <h3 class="op">The roadmap</h3>
      ${roadmapBlock(name)}
    </section>`;
  })
  .join("");

const CSS = `
:root {
  color-scheme: light dark;
  --serif: ui-serif, "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif;
  --sans: ui-sans-serif, system-ui, "Segoe UI", Roboto, sans-serif;
  --mono: ui-monospace, "Cascadia Mono", "SF Mono", Consolas, monospace;

  --ground: #eceff0;
  --surface: #ffffff;
  --sunken: #e2e7e9;
  --ink: #131a1e;
  --muted: #59666c;
  --faint: #859399;
  --line: #d2d9dd;
  --accent: #0d6f6a;
  --pass: #2c7040;
  --fail: #a93528;
  --soft: #856212;
  --mark-swim: #b9e2ee;
  --mark-overhead: #f2dcc0;
  --mark-diagnosis: #f5ccc6;
  --mark-professional: #d5e4c4;
  --mark-ink: #1b2226;
}
@media (prefers-color-scheme: dark) {
  :root {
    --ground: #0e1418;
    --surface: #161e23;
    --sunken: #111a1f;
    --ink: #e4ebee;
    --muted: #93a3ab;
    --faint: #6d7d85;
    --line: #26333a;
    --accent: #3cb8ae;
    --pass: #5cbd7c;
    --fail: #ef7f70;
    --soft: #d3a53c;
    --mark-swim: #16414f;
    --mark-overhead: #4a3618;
    --mark-diagnosis: #4d2622;
    --mark-professional: #2f4020;
    --mark-ink: #e9f0f2;
  }
}
:root[data-theme="light"] {
  --ground: #eceff0; --surface: #ffffff; --sunken: #e2e7e9; --ink: #131a1e;
  --muted: #59666c; --faint: #859399; --line: #d2d9dd; --accent: #0d6f6a;
  --pass: #2c7040; --fail: #a93528; --soft: #856212;
  --mark-swim: #b9e2ee; --mark-overhead: #f2dcc0; --mark-diagnosis: #f5ccc6;
  --mark-professional: #d5e4c4; --mark-ink: #1b2226;
}
:root[data-theme="dark"] {
  --ground: #0e1418; --surface: #161e23; --sunken: #111a1f; --ink: #e4ebee;
  --muted: #93a3ab; --faint: #6d7d85; --line: #26333a; --accent: #3cb8ae;
  --pass: #5cbd7c; --fail: #ef7f70; --soft: #d3a53c;
  --mark-swim: #16414f; --mark-overhead: #4a3618; --mark-diagnosis: #4d2622;
  --mark-professional: #2f4020; --mark-ink: #e9f0f2;
}

body {
  background: var(--ground);
  color: var(--ink);
  font-family: var(--sans);
  line-height: 1.5;
  margin: 0;
  padding: 0 clamp(0.75rem, 3vw, 2.5rem) 5rem;
  -webkit-text-size-adjust: 100%;
}
.wrap { max-width: 96rem; margin: 0 auto; }

.page-head {
  padding: clamp(2rem, 6vw, 4rem) 0 1.5rem;
  border-bottom: 2px solid var(--ink);
  margin-bottom: 2rem;
}
.eyebrow {
  font-family: var(--mono);
  font-size: 0.72rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--accent);
  margin: 0 0 0.75rem;
}
.page-head h1 {
  font-family: var(--serif);
  font-size: clamp(1.9rem, 5vw, 3rem);
  line-height: 1.1;
  font-weight: 600;
  margin: 0 0 0.75rem;
  text-wrap: balance;
}
.standfirst {
  font-family: var(--serif);
  font-size: clamp(1rem, 2.2vw, 1.15rem);
  color: var(--muted);
  max-width: 62ch;
  margin: 0;
}

.caution {
  border: 1px solid var(--line);
  border-left: 4px solid var(--soft);
  background: var(--surface);
  padding: 1.1rem 1.25rem;
  margin: 0 0 2.5rem;
  border-radius: 2px;
}
.caution h2 {
  font-family: var(--sans);
  font-size: 0.78rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--soft);
  margin: 0 0 0.5rem;
}
.caution p { margin: 0 0 0.6rem; max-width: 70ch; }
.caution p:last-child { margin-bottom: 0; }

.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 0.9rem;
  list-style: none;
  padding: 0;
  margin: 0.9rem 0 0;
  font-size: 0.8rem;
}

.scenario { margin: 0 0 4.5rem; }
.scenario-head { margin-bottom: 1.5rem; }
.scenario-head h2 {
  font-family: var(--serif);
  font-size: clamp(1.35rem, 3.2vw, 1.9rem);
  font-weight: 600;
  margin: 0 0 0.5rem;
  text-wrap: balance;
}
.purpose { color: var(--muted); max-width: 72ch; margin: 0 0 1rem; font-size: 0.95rem; }
.note {
  margin: 0;
  padding: 0.9rem 1.1rem;
  background: var(--sunken);
  border-radius: 2px;
  border-left: 3px solid var(--accent);
}
.note p { font-family: var(--serif); font-size: 1rem; margin: 0 0 0.4rem; max-width: 68ch; }
.note cite {
  font-style: normal;
  font-family: var(--mono);
  font-size: 0.7rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--faint);
}

.op {
  font-family: var(--mono);
  font-size: 0.72rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--faint);
  border-bottom: 1px solid var(--line);
  padding-bottom: 0.4rem;
  margin: 2.5rem 0 1rem;
}

.matrix-scroll { overflow-x: auto; padding-bottom: 0.5rem; }
.matrix {
  display: grid;
  grid-template-columns: 9rem repeat(var(--cols), minmax(19rem, 1fr));
  gap: 1px;
  background: var(--line);
  border: 1px solid var(--line);
  min-width: 60rem;
}
.col-head {
  background: var(--surface);
  padding: 0.9rem 1rem 1rem;
  position: sticky;
  top: 0;
  z-index: 2;
}
.col-head.corner {
  font-family: var(--mono);
  font-size: 0.7rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--faint);
  display: flex;
  align-items: flex-end;
}
.col-head .slot {
  font-family: var(--mono);
  font-size: 0.7rem;
  letter-spacing: 0.12em;
  color: var(--accent);
  margin: 0 0 0.2rem;
}
.col-head h3 {
  font-family: var(--sans);
  font-size: 0.98rem;
  font-weight: 650;
  margin: 0 0 0.5rem;
  line-height: 1.25;
}
.contract {
  font-size: 0.78rem;
  margin: 0 0 0.35rem;
  font-family: var(--mono);
  line-height: 1.35;
}
.contract.ok { color: var(--pass); }
.contract.bad { color: var(--fail); }
.contract.none { color: var(--faint); }
.load {
  font-family: var(--mono);
  font-size: 0.75rem;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
  margin: 0 0 0.6rem;
}

.chips { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 0.3rem; }
.chip {
  font-size: 0.7rem;
  line-height: 1.25;
  padding: 0.18rem 0.42rem;
  border-radius: 2px;
  border: 1px solid var(--line);
  color: var(--muted);
  background: var(--sunken);
  display: inline-flex;
  align-items: baseline;
  gap: 0.28rem;
}
.chip-mark { font-family: var(--mono); }
.chip-must { color: var(--fail); font-weight: 700; }
.chip-adv { color: var(--faint); font-weight: 700; }
.chip-pass { color: var(--pass); }
.chip-fail { color: var(--fail); border-color: var(--fail); }
.chip-soft { color: var(--soft); }
.chip-advisory { color: var(--faint); border-style: dashed; }

.day-label {
  background: var(--sunken);
  padding: 0.85rem 0.9rem;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}
.day-label .wd { font-weight: 650; font-size: 0.88rem; }
.day-label .dt {
  font-family: var(--mono);
  font-size: 0.74rem;
  color: var(--faint);
  font-variant-numeric: tabular-nums;
}
.day-label.outside { border-left: 3px solid var(--fail); }
.badge-out {
  margin-top: 0.3rem;
  font-size: 0.66rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--fail);
}

.cell { background: var(--surface); padding: 0.85rem 1rem 1rem; }
.cell.rest {
  color: var(--faint);
  font-family: var(--mono);
  font-size: 0.75rem;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 3rem;
}
.cell h4 {
  font-family: var(--serif);
  font-size: 1.02rem;
  font-weight: 600;
  margin: 0 0 0.3rem;
  line-height: 1.25;
}
.meta {
  margin: 0 0 0.45rem;
  font-family: var(--mono);
  font-size: 0.72rem;
  color: var(--muted);
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  align-items: center;
  font-variant-numeric: tabular-nums;
}
.goal {
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 0.08rem 0.45rem;
  color: var(--accent);
}
.intent {
  font-family: var(--serif);
  font-size: 0.94rem;
  line-height: 1.55;
  color: var(--ink);
  margin: 0;
  max-width: 46ch;
}

.roadmaps {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(20rem, 1fr));
  gap: 1rem;
}
.roadmap-card {
  background: var(--surface);
  border: 1px solid var(--line);
  padding: 1.1rem 1.2rem 1.3rem;
}
.roadmap-card .slot {
  font-family: var(--mono);
  font-size: 0.7rem;
  letter-spacing: 0.12em;
  color: var(--accent);
  margin: 0 0 0.2rem;
}
.roadmap-card h3 { font-size: 0.98rem; margin: 0 0 0.5rem; font-weight: 650; }
.summary {
  font-family: var(--serif);
  font-size: 0.95rem;
  margin: 0.8rem 0 0;
  color: var(--muted);
  max-width: 52ch;
}
.phases { list-style: none; margin: 1rem 0 0; padding: 0; display: flex; flex-direction: column; gap: 1rem; }
.phases li { border-top: 1px solid var(--line); padding-top: 0.8rem; }
.phase-dates {
  font-family: var(--mono);
  font-size: 0.72rem;
  color: var(--faint);
  margin: 0 0 0.25rem;
  font-variant-numeric: tabular-nums;
}
.phases h4 { font-family: var(--serif); font-size: 1rem; margin: 0 0 0.3rem; font-weight: 600; }

mark.w { background: var(--mark-swim); color: var(--mark-ink); padding: 0 0.12em; border-radius: 2px; }
mark.w-swim { background: var(--mark-swim); }
mark.w-overhead { background: var(--mark-overhead); }
mark.w-diagnosis { background: var(--mark-diagnosis); }
mark.w-professional { background: var(--mark-professional); }

.notes-block { margin-top: 3rem; border-top: 1px solid var(--line); padding-top: 1.5rem; }
.notes-block h2 { font-family: var(--serif); font-size: 1.2rem; margin: 0 0 0.6rem; }
.notes-block pre {
  white-space: pre-wrap;
  font-family: var(--serif);
  font-size: 0.95rem;
  margin: 0;
  max-width: 68ch;
}
footer {
  margin-top: 3rem;
  font-family: var(--mono);
  font-size: 0.72rem;
  color: var(--faint);
}
@media (max-width: 40rem) {
  .matrix { grid-template-columns: 6.5rem repeat(var(--cols), minmax(16rem, 1fr)); }
  .col-head { position: static; }
}
`;

const page = `<title>M3-01B model bake-off — reading the plans</title>
<style>${CSS}</style>
<div class="wrap">
  <header class="page-head">
    <p class="eyebrow">M3-01B · decision 1b · gate 2</p>
    <h1>Reading the plans, not the JSON</h1>
    <p class="standfirst">Every model's week, aligned day by day so the differences show. The
    mechanical gate has already run; what is left is the judgement only you can make — would you
    actually train on this?</p>
  </header>

  <section class="caution">
    <h2>Read the highlights before the verdicts</h2>
    <p>The probe chips below come from regexes over free text, and free text says what it is
    <em>not</em> doing. &ldquo;I am leaving swimming out&rdquo; contains the word
    <em>swimming</em>, so a probe that looks for swimming fires on a model that correctly
    excluded it. Every watch word is highlighted inline — when a chip is red, read the highlight
    and decide for yourself whether the model proposed the thing or refused it.</p>
    <ul class="legend">${legend}</ul>
  </section>

  ${sections}

  ${notes ? `<section class="notes-block"><h2>Your notes from the worksheet</h2><pre>${escapeHtml(notes)}</pre></section>` : ""}

  <footer>Rendered ${new Date().toISOString()} from ${escapeHtml(FILE.split(/[\\/]/).pop())}.</footer>
</div>`;

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, page, "utf8");
console.log(`Wrote ${OUT}`);
