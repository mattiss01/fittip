/**
 * One report renderer for every path, so the three entry points cannot report
 * the same result differently.
 *
 * A `result` is:
 *   { label, scenario, operation, skipped, parsed, schemaHeld, failures, probes }
 */

import { summarise } from "./evaluate.mjs";

const tick = (b) => (b ? "yes" : "**no**");

export function renderReport({ title, source, results, notes, caveat }) {
  const answered = results.filter((r) => !r.skipped);
  const lines = [`# ${title}`, ``, `Scored ${new Date().toISOString()} from \`${source}\`.`];

  lines.push(`${answered.length} of ${results.length} slots filled.`, ``);

  if (caveat) lines.push(caveat, ``);

  if (answered.length === 0) {
    lines.push(`Nothing to score yet.`);
    return lines.join("\n");
  }

  // --- gate 1 -------------------------------------------------------------

  lines.push(
    `## Gate 1 — the contract`,
    ``,
    `Ownership, dates, and shape. A model that fails here is out regardless of how well it writes.`,
    ``,
    `| Model | Scenario | Operation | Held | Failures |`,
    `| --- | --- | --- | --- | --- |`,
  );
  for (const r of answered) {
    lines.push(
      `| ${r.label} | ${r.scenario} | ${r.operation.replace("create_", "")} | ${tick(r.schemaHeld)} | ${r.schemaHeld ? "—" : r.failures.length} |`,
    );
  }

  const broken = answered.filter((r) => !r.schemaHeld);
  if (broken.length > 0) {
    lines.push(``, `### What failed`, ``);
    for (const r of broken) {
      lines.push(`**${r.label}** — ${r.scenario} / ${r.operation}`);
      for (const f of r.failures) lines.push(`- ${f}`);
      lines.push(``);
    }
  }

  // --- gate 1b: hard constraints ------------------------------------------

  const withProbes = answered.filter((r) => r.probes);
  const safetyFailures = [];
  for (const r of withProbes) {
    const s = summarise(r.probes);
    if (s.mustPassFailed.length > 0) {
      safetyFailures.push({ ...r, failed: s.mustPassFailed });
    }
  }

  lines.push(`## Hard constraints and safety`, ``);
  if (safetyFailures.length === 0) {
    lines.push(
      `No must-pass probe failed. Every answer respected its scenario's hard constraints.`,
      ``,
    );
  } else {
    lines.push(
      `**These are disqualifying.** A must-pass probe encodes a safety rule or a`,
      `constraint the athlete stated explicitly — not a preference.`,
      ``,
    );
    for (const r of safetyFailures) {
      lines.push(`- **${r.label}** — ${r.scenario} / ${r.operation.replace("create_", "")}`);
      for (const f of r.failed) lines.push(`  - ${f}`);
    }
    lines.push(``);
  }

  // --- per-scenario probe detail ------------------------------------------

  const scenarios = [...new Set(withProbes.map((r) => r.scenario))];
  for (const name of scenarios) {
    const rows = withProbes.filter((r) => r.scenario === name);
    const probeIds = [];
    for (const r of rows) {
      for (const p of r.probes) {
        if (!probeIds.some((x) => x.id === p.id && x.op === r.operation)) {
          probeIds.push({ id: p.id, label: p.label, op: r.operation, mustPass: p.mustPass });
        }
      }
    }

    for (const op of ["create_seven_day_plan", "create_roadmap"]) {
      const opRows = rows.filter((r) => r.operation === op);
      if (opRows.length === 0) continue;
      const cols = probeIds.filter((p) => p.op === op);
      if (cols.length === 0) continue;

      lines.push(
        `### ${name} — ${op.replace("create_", "")}`,
        ``,
        `| Model | ${cols.map((c) => `${c.label}${c.mustPass ? " *" : ""}`).join(" | ")} |`,
        `| --- | ${cols.map(() => "---").join(" | ")} |`,
      );
      for (const r of opRows) {
        const cells = cols.map((c) => {
          const hit = r.probes.find((p) => p.id === c.id);
          return hit ? tick(hit.passed) : "—";
        });
        lines.push(`| ${r.label} | ${cells.join(" | ")} |`);
      }
      lines.push(``, `\\* must pass`, ``);
    }
  }

  // --- gate 2 -------------------------------------------------------------

  lines.push(`## Gate 2 — the product owner's read`, ``);
  lines.push(
    notes && notes.replace(/\*\*[ABC] —\*\*/g, "").trim().length > 20
      ? notes
      : `_Not filled in. Gate 2 is the deciding gate — nothing above substitutes for it._`,
  );

  // --- the rule -----------------------------------------------------------

  const byLabel = new Map();
  for (const r of answered) {
    const entry = byLabel.get(r.label) ?? { gate1: true, hardOk: true };
    if (!r.schemaHeld) entry.gate1 = false;
    const s = r.probes ? summarise(r.probes) : null;
    if (s && s.mustPassFailed.length > 0) entry.hardOk = false;
    byLabel.set(r.label, entry);
  }

  lines.push(
    ``,
    `## Applying the rule`,
    ``,
    `**The cheapest tier that clears both gates — not the best model.**`,
    ``,
  );
  for (const [label, entry] of byLabel) {
    lines.push(
      `- **${label}** — contract ${entry.gate1 ? "passes" : "**fails**"}, hard constraints ${entry.hardOk ? "pass" : "**fail**"}. Gate 2 is yours.`,
    );
  }
  lines.push(
    ``,
    `Take the cheapest model that passes both mechanical checks *and* that you`,
    `would actually follow. A cheap model that passes gate 1 and loses gate 2 is`,
    `the expected outcome at the small end — that is what this exists to find.`,
    ``,
    `Record the chosen model and this evidence in M3-01B decision 1b.`,
  );

  return lines.join("\n");
}
