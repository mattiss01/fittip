import { readFileSync, readdirSync } from "node:fs";
import { extname, join } from "node:path";

import { describe, expect, it } from "vitest";

import { NETWORK_FREE_COACH_AI_ADAPTERS } from "@/server/ai/network-free-adapters";

/**
 * A module that can reach the network must not be able to bypass the live
 * enablement gate.
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
 */

const AI_ROOT = join(process.cwd(), "src", "server", "ai");
const SERVICE = join(AI_ROOT, "coach-ai-service.ts");

/**
 * Anything that could open a socket. Deliberately broader than the calls an
 * adapter would actually make: this is a tripwire, and a false positive costs a
 * conversation while a false negative costs an ungated provider call.
 */
const NETWORK_PRIMITIVE =
  /\b(fetch|XMLHttpRequest|WebSocket|EventSource)\b|from\s+["'](?:node:)?(?:http|https|net|tls|undici|axios)["']|require\(["'](?:node:)?(?:http|https|net|tls)["']\)/;

const RUNTIME_FILES = sourceFiles(AI_ROOT).filter(
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
