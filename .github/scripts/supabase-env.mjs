#!/usr/bin/env node
// Derives the local Supabase coordinates the FitTip tests expect from the
// running stack and exports them to later workflow steps.
//
// These are ephemeral credentials belonging to a throwaway CI container that no
// external traffic can reach. They are not project secrets and no repository
// secret is required to run this pipeline.

import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";

const reported = execFileSync("npx", ["supabase", "status", "-o", "env"], {
  encoding: "utf8",
});

const values = new Map();
for (const line of reported.split(/\r?\n/)) {
  const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (!match) {
    continue;
  }
  values.set(match[1], match[2].trim().replace(/^"(.*)"$/s, "$1"));
}

const withPrefix = (prefix) =>
  [...values.values()].find((value) => value.startsWith(prefix));

const url = values.get("API_URL") ?? "http://127.0.0.1:54321";

// The application validator accepts only modern `sb_publishable_...` keys, so
// prefer a value of that shape over whichever name the CLI reports it under.
const publishableKey =
  withPrefix("sb_publishable_") ??
  values.get("PUBLISHABLE_KEY") ??
  values.get("ANON_KEY");

// The admin harness accepts a modern secret key or the legacy service-role JWT.
const serviceRoleKey =
  withPrefix("sb_secret_") ??
  values.get("SECRET_KEY") ??
  values.get("SERVICE_ROLE_KEY");

if (!publishableKey || !serviceRoleKey) {
  console.error(
    `Could not derive Supabase keys. Reported names: ${[...values.keys()].join(", ")}`,
  );
  process.exit(1);
}

const environmentFile = process.env.GITHUB_ENV;
if (!environmentFile) {
  console.error(
    "GITHUB_ENV is unset; this script only runs in GitHub Actions.",
  );
  process.exit(1);
}

// Throwaway container keys are still key-shaped strings, and this repository is
// public. Mask them so later steps do not print them into the run log.
console.log(`::add-mask::${publishableKey}`);
console.log(`::add-mask::${serviceRoleKey}`);

appendFileSync(
  environmentFile,
  [
    `NEXT_PUBLIC_SUPABASE_URL=${url}`,
    `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${publishableKey}`,
    `SUPABASE_SERVICE_ROLE_KEY=${serviceRoleKey}`,
    "",
  ].join("\n"),
);

console.log(`Local Supabase URL: ${url}`);
console.log(
  "Derived and masked the local stack's publishable and secret keys.",
);
