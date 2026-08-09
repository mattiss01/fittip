/**
 * The scenario registry.
 *
 * Order matters: `REQUIRED` is the minimum set that decides the model, and the
 * rest are available for M3-02 and M3-03 prompt tuning. Running all four is
 * better; running only the required two still separates the tiers, and a suite
 * nobody completes is worth less than a smaller one that gets done.
 */

import { scenario as returningTrailRunner } from "./returning-trail-runner.mjs";
import { scenario as coldStart } from "./cold-start.mjs";
import { scenario as injuryActive } from "./injury-active.mjs";
import { scenario as strengthAthlete } from "./strength-athlete.mjs";

export const SCENARIOS = {
  "cold-start": coldStart,
  "injury-active": injuryActive,
  "returning-trail-runner": returningTrailRunner,
  "strength-athlete": strengthAthlete,
};

/**
 * The two that decide the model, and why these two.
 *
 * `cold-start` is the most common real case and catches invention — a model
 * that fabricates a training history for a new user fails here and nowhere
 * else. `injury-active` is the highest-stakes rule in the product and the one
 * place a wrong answer could hurt someone. Between them they bracket the two
 * failure directions: making things up, and mishandling a safety signal.
 *
 * `returning-trail-runner` is the richest context and the best tier
 * discriminator, but it overlaps both. `strength-athlete` guards the
 * sport-agnostic invariant, which matters most once prompts are being tuned in
 * M3-02 and M3-03 rather than while a tier is being chosen.
 */
export const REQUIRED = ["cold-start", "injury-active"];

export const OPTIONAL = Object.keys(SCENARIOS).filter(
  (name) => !REQUIRED.includes(name),
);

export function getScenario(name) {
  const found = SCENARIOS[name];
  if (!found) {
    throw new Error(
      `Unknown scenario "${name}". Known: ${Object.keys(SCENARIOS).join(", ")}`,
    );
  }
  return found;
}
