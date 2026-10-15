import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The spec each per-ticket config pins with `testMatch`. Those specs run under
 * their own config (its port, time zone and timeouts), so the root config
 * leaves them out and runs every other spec: a plain new spec is collected by
 * the root config, and so by CI, without anyone having to name it.
 */
export function claimedSpecs(e2eDirectory: string): string[] {
  return readdirSync(e2eDirectory)
    .filter((file) => file.endsWith(".playwright.config.ts"))
    .flatMap((file) => {
      const source = readFileSync(join(e2eDirectory, file), "utf8");
      const match = /^\s*testMatch:\s*"([^"]+)"/m.exec(source);
      return match ? [match[1]] : [];
    });
}
