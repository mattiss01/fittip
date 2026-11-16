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
 * afterwards as after any reset. The readable file is deleted on every way
 * out, and a leftover from an interrupted run is deleted at the start.
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";

import { BackupError, fitToLocalSchema, redact } from "./backup-core.mjs";
import { gpgEnv, loadConfig, prepareWorkDir } from "./backup.mjs";

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

function localColumns() {
  const listed = psql(
    "select c.table_schema || '.' || c.table_name, c.column_name " +
      "from information_schema.columns c join information_schema.tables t " +
      "using (table_schema, table_name) where t.table_type = 'BASE TABLE'",
  );
  if (listed.status !== 0) {
    throw new BackupError(
      `Reading the local schema failed: ${redact(listed.stderr)}`,
    );
  }
  const columns = new Map();
  for (const line of listed.stdout.split(/\r?\n/).filter(Boolean)) {
    const [table, column] = line.split("|");
    if (!columns.has(table)) columns.set(table, new Set());
    columns.get(table).add(column);
  }
  return columns;
}

function restore(file, config, plain) {
  const decrypted = spawnSync(
    config.gpg,
    ["--yes", "--output", plain, "--decrypt", file],
    { env: gpgEnv(config), stdio: "inherit" },
  );
  if (decrypted.status !== 0) throw new BackupError("Decrypting failed.");

  console.log("Resetting the local database to the migrations…");
  const reset = spawnSync("node_modules\\.bin\\supabase.cmd db reset --local", {
    shell: true,
    stdio: "inherit",
  });
  if (reset.status !== 0) throw new BackupError("The local reset failed.");

  const fit = fitToLocalSchema(readFileSync(plain, "utf8"), localColumns());
  // Out of the way before anything else can fail.
  rmSync(plain, { force: true });
  const loaded = psql(null, fit.sql);
  if (loaded.status !== 0) {
    // psql quotes the row it refused; only the reason is shown.
    throw new BackupError(
      `Loading failed: ${redact(loaded.stderr.split("\n")[0])}`,
    );
  }

  // Every row the backup holds for a table is now in it.
  let mismatches = 0;
  for (const [table, rows] of Object.entries(fit.rows)) {
    const got = Number(psql(`select count(*) from ${table}`).stdout.trim());
    if (got !== rows) mismatches += 1;
    console.log(
      `${got === rows ? "ok  " : "DIFF"} ${table}: ${got} of ${rows}`,
    );
  }
  for (const [what, count] of Object.entries(fit.skipped)) {
    console.log(`skipped ${what}: ${count} (not in the local schema)`);
  }
  if (mismatches > 0) {
    throw new BackupError(`${mismatches} tables differ from the backup.`);
  }
}

const file = process.argv[2];
let plain = null;
try {
  if (!file || !existsSync(file) || !file.endsWith(".sql.gpg")) {
    throw new BackupError(
      "Name the backup to restore: a fittip-….sql.gpg file.",
    );
  }
  const config = loadConfig();
  if (spawnSync("docker", ["inspect", CONTAINER]).status !== 0) {
    throw new BackupError(
      "The local stack is not running. Start it with npx.cmd supabase start.",
    );
  }
  prepareWorkDir(config);
  plain = path.win32.join(config.workDir, "restore.sql");
  restore(file, config, plain);
  console.log(`Restored ${path.basename(file)} into the local stack.`);
} catch (error) {
  console.error(redact(error instanceof Error ? error.message : error));
  process.exitCode = 1;
} finally {
  if (plain !== null) rmSync(plain, { force: true });
}
