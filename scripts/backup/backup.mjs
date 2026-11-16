/**
 * A backup of the founder project (B3, ADR-043 decision 7, owner 16 Nov
 * 2026): the data dumped, encrypted to the owner's backup key, written to
 * OneDrive, and anything older than four weeks deleted. Run weekly by a
 * Windows scheduled task, and before each hosted migration:
 *
 *   npm.cmd run backup
 *   npm.cmd run backup -- --reason pre-migration
 *
 * The readable dump exists only in a working folder outside OneDrive and is
 * deleted whatever happens. Encrypting needs only the public key; restoring
 * (`restore.mjs`) needs the private key and its passphrase, which the owner
 * keeps. Only data is dumped: the schema is the migrations at the commit the
 * file is named after.
 */

import { spawnSync } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  BackupError,
  backupFileName,
  expiredBackups,
  msysPath,
  readBackupConfig,
  readReason,
  redact,
} from "./backup-core.mjs";

export function loadConfig() {
  const file = path.join(os.homedir(), ".fittip-backup.json");
  if (!existsSync(file)) {
    throw new BackupError(`No backup configuration at ${file}.`);
  }
  return readBackupConfig(JSON.parse(readFileSync(file, "utf8")), {
    oneDrive: process.env.OneDrive,
    localAppData: process.env.LOCALAPPDATA,
  });
}

export function gpgEnv(config) {
  return { ...process.env, GNUPGHOME: msysPath(config.gnupgHome) };
}

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    ...options,
  });
}

function backup(config, reason) {
  if (run("docker", ["info"]).status !== 0) {
    throw new BackupError(
      "Docker is not running. Start Docker Desktop; the Supabase CLI dumps through it.",
    );
  }
  const key = run(config.gpg, ["--list-keys", config.fingerprint], {
    env: gpgEnv(config),
  });
  if (key.status !== 0) {
    throw new BackupError("The backup key is not in the keyring.");
  }
  const commit = run("git", ["rev-parse", "--short", "HEAD"]).stdout?.trim();
  const name = backupFileName(new Date(), reason, commit ?? "");

  mkdirSync(config.workDir, { recursive: true });
  mkdirSync(config.folder, { recursive: true });
  const plain = path.win32.join(config.workDir, name.replace(/\.gpg$/, ""));
  const target = path.win32.join(config.folder, name);
  try {
    const dumped = run(
      `node_modules\\.bin\\supabase.cmd db dump --linked --data-only --use-copy --file ${plain}`,
      [],
      { shell: true },
    );
    if (dumped.status !== 0 || !existsSync(plain)) {
      throw new BackupError(
        `The dump failed: ${redact(dumped.stderr || dumped.stdout || dumped.status)}`,
      );
    }
    if (!/^COPY /m.test(readFileSync(plain, "utf8"))) {
      throw new BackupError("The dump holds no data.");
    }
    const encrypted = run(
      config.gpg,
      [
        "--batch",
        "--yes",
        "--trust-model",
        "always",
        "--recipient",
        config.fingerprint,
        "--output",
        target,
        "--encrypt",
        plain,
      ],
      { env: gpgEnv(config) },
    );
    if (encrypted.status !== 0 || !existsSync(target)) {
      rmSync(target, { force: true });
      throw new BackupError(`Encrypting failed: ${redact(encrypted.stderr)}`);
    }
  } finally {
    rmSync(plain, { force: true });
  }

  const pruned = expiredBackups(readdirSync(config.folder), new Date());
  for (const old of pruned) {
    rmSync(path.win32.join(config.folder, old), { force: true });
  }
  return { name, bytes: statSync(target).size, pruned: pruned.length };
}

function log(config, line) {
  try {
    mkdirSync(path.dirname(config.log), { recursive: true });
    appendFileSync(config.log, `${new Date().toISOString()} ${line}\n`);
  } catch (error) {
    // The console still has the line; say why the log does not.
    console.error(`The log could not be written: ${redact(error?.message)}`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  let config;
  try {
    config = loadConfig();
    const reason = readReason(process.argv.slice(2));
    const result = backup(config, reason);
    const line = `OK ${result.name} (${result.bytes} bytes), ${result.pruned} older than 4 weeks deleted`;
    log(config, line);
    console.log(line);
  } catch (error) {
    const line = `FAILED ${redact(error instanceof Error ? error.message : error)}`;
    if (config) log(config, line);
    console.error(line);
    process.exitCode = 1;
  }
}
