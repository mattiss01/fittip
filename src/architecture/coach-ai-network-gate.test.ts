import { readFileSync, readdirSync } from "node:fs";
import { extname, join } from "node:path";

import { describe, expect, it } from "vitest";

import { NETWORK_FREE_COACH_AI_ADAPTERS } from "@/server/ai/network-free-adapters";

/**
 * A module that shapes owner data into a provider payload must not be able to
 * reach the network outside the gated adapter.
 *
 * M3-01's independent review found the gate running only when
 * `adapter.kind === "provider"`. `kind` is a field an adapter sets about
 * itself, so a provider adapter copy-pasted from `FixtureCoachAI` would have
 * kept `kind: "fixture"` and called out with no live flag, no owner allowlist
 * and no credential check — and no invariant would have caught it. This file is
 * the invariant M3-01B owes for that.
 *
 * It is written against the file tree rather than against today's classes, so
 * it fails on the file somebody adds next year rather than only on the ones
 * that exist now.
 *
 * ## Why it scans more than `src/server/ai`
 *
 * M3-15D's review found the scan had stopped covering its own subject. The
 * production context source — the one module that reads a real owner's records
 * and assembles them for a provider — lives in `src/server/context`, so a
 * `fetch` added to it would have been caught by nothing. What the invariant is
 * about is the data, not the directory: a socket opened anywhere that selects,
 * reduces, or assembles owner data bound for a coach is either an ungated
 * provider call or an exfiltration of exactly the records the boundary exists
 * to bound. So the scan names every root that holds such a module, and the two
 * eligibility gates that decide what is even eligible are in it for the same
 * reason as the source that reads them.
 *
 * Being a superset is the intended direction. `training-measurements.ts` and
 * the goal and memory record modules also serve surfaces that have nothing to
 * do with a coach, and none of them has any business opening a socket either. A
 * false positive here costs a conversation; a false negative costs an ungated
 * provider call with owner training history in it.
 */

const AI_ROOT = join(process.cwd(), "src", "server", "ai");
const SERVICE = join(AI_ROOT, "coach-ai-service.ts");

/** Every root holding a module that shapes provider-bound owner data. */
const PROVIDER_BOUND_ROOTS = [
  // The boundary itself: contracts, context assembly, prompts, validation,
  // the service, and the one adapter permitted to call out.
  AI_ROOT,
  // `coach-ai-context-source.ts`, which reads the owner's real records.
  join(process.cwd(), "src", "server", "context"),
  // ADR-013's completion allowlist, which is what bounds those records.
  join(process.cwd(), "src", "server", "training"),
  // ADR-012's goal eligibility gate.
  join(process.cwd(), "src", "server", "goals"),
  // M2-02's memory eligibility gate.
  join(process.cwd(), "src", "server", "memory"),
];

/**
 * Anything that could open a socket. Deliberately broader than the calls an
 * adapter would actually make: this is a tripwire, and a false positive costs a
 * conversation while a false negative costs an ungated provider call.
 */
const NETWORK_PRIMITIVE =
  /\b(fetch|XMLHttpRequest|WebSocket|EventSource)\b|from\s+["'](?:node:)?(?:http|https|net|tls|undici|axios)["']|require\(["'](?:node:)?(?:http|https|net|tls)["']\)/;

const RUNTIME_FILES = PROVIDER_BOUND_ROOTS.flatMap(sourceFiles).filter(
  (path) => !path.endsWith(".test.ts"),
);

describe("the coaching network gate cannot be bypassed", () => {
  it("lets exactly one module reach the network", () => {
    const reaching = RUNTIME_FILES.filter((path) =>
      NETWORK_PRIMITIVE.test(readFileSync(path, "utf8")),
    );

    // Adding a second provider is a product-owner decision, not a file. If this
    // fails because a new adapter arrived, the ticket that added it owes an
    // approved decision and an update here — not a wider pattern.
    expect(reaching).toEqual([join(AI_ROOT, "openai-adapter.ts")]);
    // The scan is only worth its assertion if it is actually reading the
    // modules outside `src/server/ai`, so it says so rather than assuming it.
    expect(RUNTIME_FILES).toContain(
      join(
        process.cwd(),
        "src",
        "server",
        "context",
        "coach-ai-context-source.ts",
      ),
    );
    expect(RUNTIME_FILES).toContain(
      join(
        process.cwd(),
        "src",
        "server",
        "training",
        "training-history-context.ts",
      ),
    );
  });

  it("gates on adapter identity rather than on what an adapter claims to be", () => {
    const service = readFileSync(SERVICE, "utf8");

    // The precise defect: a self-declared `kind` deciding whether the gate runs.
    expect(service).not.toMatch(/adapter\.kind\s*===/);
    expect(service).toMatch(
      /if\s*\(!isNetworkFreeCoachAI\(this\.deps\.adapter\)\)/,
    );
    expect(service).toMatch(/requireCoachAILiveEnablement\(/);
  });

  it("exempts only adapters that cannot reach the network", () => {
    const exempt = NETWORK_FREE_COACH_AI_ADAPTERS.map(
      (constructor) => constructor.name,
    );
    expect(exempt).toEqual(["FixtureCoachAI"]);

    // An exemption must never be granted to a module that could call out, so
    // no file holding a network primitive may declare an exempt class.
    for (const path of RUNTIME_FILES) {
      const source = readFileSync(path, "utf8");
      if (!NETWORK_PRIMITIVE.test(source)) continue;

      for (const name of exempt) {
        expect(source).not.toMatch(new RegExp(`class\\s+${name}\\b`));
      }
    }
  });

  it("matches an exempt adapter exactly, so a subclass inherits no exemption", () => {
    const allowlist = readFileSync(
      join(AI_ROOT, "network-free-adapters.ts"),
      "utf8",
    );

    // `instanceof` would exempt a subclass, and a subclass can add a socket.
    // Asserted against code only: the comment above the allowlist explains why
    // `instanceof` is wrong, and it would otherwise match itself.
    expect(allowlist).toMatch(/adapter\.constructor\s*===\s*candidate/);
    expect(withoutComments(allowlist)).not.toMatch(/\binstanceof\b/);
  });
});

/**
 * Acceptance criterion 5, enforced rather than promised. M3-01B has no API key
 * and must make no real provider call, and "we were careful" is not a control.
 */
describe("no test can reach a real provider", () => {
  const PROVIDER_HOST = ["api", "openai", "com"].join(".");
  const SOURCES = sourceFiles(join(process.cwd(), "src"));

  it("names the provider host only as the adapter's default", () => {
    const naming = SOURCES.filter((path) =>
      readFileSync(path, "utf8").includes(PROVIDER_HOST),
    );

    expect(naming).toEqual([join(AI_ROOT, "openai-adapter.ts")]);
  });

  it("keeps the provider host out of every test", () => {
    const tests = SOURCES.filter(
      (path) => path.endsWith(".test.ts") || path.endsWith(".test.tsx"),
    );

    expect(tests.length).toBeGreaterThan(20);
    for (const path of tests) {
      // A stub on loopback is the only endpoint a test may talk to.
      expect(readFileSync(path, "utf8")).not.toContain(PROVIDER_HOST);
    }
  });
});

/** Strips block and line comments so an assertion reads code, not prose. */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return [".ts", ".tsx"].includes(extname(entry.name)) ? [path] : [];
  });
}
