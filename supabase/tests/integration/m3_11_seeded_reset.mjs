#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, "../../..");
const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const databaseContainer = "supabase_db_fittip";

run(npx, [
  "supabase",
  "db",
  "reset",
  "--local",
  "--version",
  "20260814164502",
  "--no-seed",
]);
runSql(join(here, "../fixtures/m3_11_pre_reset.sql"));
run(npx, ["supabase", "migration", "up", "--local"]);
runSql(join(here, "../fixtures/m3_11_post_reset_verify.sql"));

console.log("M3-11 seeded legacy reset passed.");

function run(command, args) {
  execFileSync(command, args, {
    cwd: projectRoot,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
}

function runSql(path) {
  execFileSync(
    "docker",
    [
      "exec",
      "-i",
      databaseContainer,
      "psql",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "postgres",
    ],
    {
      cwd: projectRoot,
      input: readFileSync(path),
      stdio: ["pipe", "inherit", "inherit"],
    },
  );
}
