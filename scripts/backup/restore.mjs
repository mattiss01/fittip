/**
 * Restores one backup into the LOCAL stack, to prove it restores (B3,
 * ADR-043 decision 7). Never the hosted project: it resets with `--local`
 * and loads into the local database container only.
 *
 *   npm.cmd run backup:restore -- <path to fittip-….sql.gpg>
 *
 * gpg asks for the backup key's passphrase in its own prompt. The local
 * database is reset to the migrations first, so the local owner account and
 * the test athletes are replaced by the backup's people; recreate them
 * afterwards as after any reset. The readable files are deleted whatever
 * happens.
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";

import { fitToLocalSchema } from "./backup-core.mjs";
import { gpgEnv, loadConfig } from "./backup.mjs";

const CONTAINER = "supabase_db_fittip";

function psql(sql, input) {
  return spawnSync(
    "docker",
    [
      "exec",
      "-i",
      CONTAINER,
      "psql",
      "-U",
      "supabase_admin",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
      "-At",
      "-F",
      "|",
      ...(sql ? ["-c", sql] : ["-q"]),
    ],
    { encoding: "utf8", input, maxBuffer: 256 * 1024 * 1024 },
  );
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

const file = process.argv[2];
if (!file || !existsSync(file) || !file.endsWith(".sql.gpg")) {
  fail("Name the backup to restore: a fittip-….sql.gpg file.");
}
const config = loadConfig();
if (spawnSync("docker", ["inspect", CONTAINER]).status !== 0) {
  fail("The local stack is not running. Start it with npx.cmd supabase start.");
}

mkdirSync(config.workDir, { recursive: true });
const plain = path.win32.join(config.workDir, "restore.sql");
try {
  const decrypted = spawnSync(
    config.gpg,
    ["--yes", "--output", plain, "--decrypt", file],
    { env: gpgEnv(config), stdio: "inherit" },
  );
  if (decrypted.status !== 0) fail("Decrypting failed.");

  console.log("Resetting the local database to the migrations…");
  const reset = spawnSync("node_modules\\.bin\\supabase.cmd db reset --local", {
    shell: true,
    stdio: "inherit",
  });
  if (reset.status !== 0) fail("The local reset failed.");

  const listed = psql(
    "select c.table_schema || '.' || c.table_name, c.column_name " +
      "from information_schema.columns c join information_schema.tables t " +
      "using (table_schema, table_name) where t.table_type = 'BASE TABLE'",
  );
  if (listed.status !== 0)
    fail(`Reading the local schema failed: ${listed.stderr}`);
  const columns = new Map();
  for (const line of listed.stdout.split(/\r?\n/).filter(Boolean)) {
    const [table, column] = line.split("|");
    if (!columns.has(table)) columns.set(table, new Set());
    columns.get(table).add(column);
  }

  const fit = fitToLocalSchema(readFileSync(plain, "utf8"), columns);
  const loaded = psql(null, fit.sql);
  if (loaded.status !== 0) fail(`Loading failed: ${loaded.stderr}`);

  // Every row the dump holds for a table is now in it.
  const expected = new Map();
  let current = null;
  for (const line of fit.sql.split("\n")) {
    const start = /^COPY "([^"]+)"\."([^"]+)"/.exec(line);
    if (start) current = `"${start[1]}"."${start[2]}"`;
    else if (line === "\\.") current = null;
    else if (current) expected.set(current, (expected.get(current) ?? 0) + 1);
  }
  let mismatches = 0;
  for (const [table, rows] of expected) {
    const counted = psql(`select count(*) from ${table}`);
    const got = Number(counted.stdout.trim());
    const ok = got === rows;
    if (!ok) mismatches += 1;
    console.log(`${ok ? "ok  " : "DIFF"} ${table}: ${got} of ${rows}`);
  }
  for (const [what, count] of Object.entries(fit.skipped)) {
    console.log(`skipped ${what}: ${count} (not in the local schema)`);
  }
  if (mismatches > 0) fail(`${mismatches} tables differ from the backup.`);
  console.log(`Restored ${path.basename(file)} into the local stack.`);
} finally {
  rmSync(plain, { force: true });
}
