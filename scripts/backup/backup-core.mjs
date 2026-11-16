/**
 * The parts of the founder-project backup that decide something (B3, ADR-043
 * decision 7): what a backup is called, which ones are old enough to delete,
 * and whether the configuration is safe to run with. No I/O, so each rule is
 * tested on its own; `backup.mjs` does the running.
 */

import path from "node:path";

export class BackupError extends Error {}

/** As long as the privacy notice says backups are kept (owner, 12 Nov 2026). */
export const RETENTION_DAYS = 28;

export const REASONS = ["weekly", "pre-migration"];

const NAME =
  /^fittip-(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z-(weekly|pre-migration)-([0-9a-f]{7,40})\.sql\.gpg$/;

/** `fittip-20261116T091500Z-weekly-9e5776b.sql.gpg`: when, why, at which code. */
export function backupFileName(date, reason, commit) {
  if (!REASONS.includes(reason)) {
    throw new BackupError(`Unknown backup reason: ${reason}`);
  }
  if (!/^[0-9a-f]{7,40}$/.test(commit)) {
    throw new BackupError("The commit must be a git hash.");
  }
  const stamp = date
    .toISOString()
    .replace(/\.\d{3}Z$/, "Z")
    .replace(/[-:]/g, "");
  return `fittip-${stamp}-${reason}-${commit}.sql.gpg`;
}

/** When a backup was taken, from its name; null for any other file. */
export function backupTakenAt(name) {
  const match = NAME.exec(name);
  if (match === null) return null;
  const [, y, mo, d, h, mi, s] = match;
  return new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s));
}

/**
 * The backups older than the retention period. Only names this script writes
 * are ever chosen, so nothing else in the folder can be deleted by it.
 */
export function expiredBackups(names, now, days = RETENTION_DAYS) {
  const cutoff = now.getTime() - days * 24 * 60 * 60 * 1000;
  return names.filter((name) => {
    const taken = backupTakenAt(name);
    return taken !== null && taken.getTime() < cutoff;
  });
}

/** Whether `child` is `parent` or inside it, as Windows compares paths. */
export function isInside(child, parent) {
  const relative = path.win32.relative(
    path.win32.resolve(parent).toLowerCase(),
    path.win32.resolve(child).toLowerCase(),
  );
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.win32.isAbsolute(relative))
  );
}

/**
 * The configuration in `%USERPROFILE%\.fittip-backup.json`, checked before
 * anything is dumped: the key's full fingerprint, a backup folder inside
 * OneDrive, and a working folder that is not, so the readable dump never
 * syncs anywhere. Nothing in it is secret.
 */
export function readBackupConfig(raw, { oneDrive, localAppData }) {
  if (!oneDrive) throw new BackupError("OneDrive is not set up on this user.");
  if (!localAppData) throw new BackupError("LOCALAPPDATA is not set.");
  const fingerprint = String(raw?.fingerprint ?? "")
    .replace(/\s/g, "")
    .toUpperCase();
  if (!/^[0-9A-F]{40}$/.test(fingerprint)) {
    throw new BackupError(
      "The backup key's fingerprint must be its full 40 characters.",
    );
  }
  const folder = String(raw?.folder ?? "");
  if (!folder || !path.win32.isAbsolute(folder)) {
    throw new BackupError("The backup folder must be an absolute path.");
  }
  if (!isInside(folder, oneDrive) || isInside(oneDrive, folder)) {
    throw new BackupError(
      "The backup folder must be a folder inside OneDrive.",
    );
  }
  const workDir = path.win32.join(localAppData, "FitTip", "backup-tmp");
  if (isInside(workDir, oneDrive)) {
    throw new BackupError("The working folder must not be inside OneDrive.");
  }
  if (/\s/.test(workDir)) {
    // The Supabase CLI's .cmd wrapper breaks on a quoted path.
    throw new BackupError("The working folder's path must have no spaces.");
  }
  const gpg = String(raw?.gpg ?? "C:\\Program Files\\Git\\usr\\bin\\gpg.exe");
  const gnupgHome = String(raw?.gnupgHome ?? "");
  if (!path.win32.isAbsolute(gnupgHome)) {
    throw new BackupError("gnupgHome must be the keyring's absolute path.");
  }
  return {
    fingerprint,
    folder,
    workDir,
    gpg,
    gnupgHome,
    log: path.win32.join(localAppData, "FitTip", "backup.log"),
  };
}

const COPY_START = /^COPY "([^"]+)"\."([^"]+)" \((.*)\) FROM stdin;$/;
const COPY_END = "\\.";
const NULL_VALUE = "\\N";

/**
 * The dump fitted to the local schema. Hosted Auth runs a newer version than
 * the local stack, with tables (MFA, SCIM) and columns the local schema
 * lacks: their data is left out, and what was left out is returned (rows of
 * a missing table, values that were not empty in a missing column), so a
 * restore says what it skipped instead of failing or dropping it silently.
 *
 * `columns` maps `schema.table` to the set of its local column names. COPY's
 * text format escapes a tab inside a value, so a row splits on tabs exactly.
 */
export function fitToLocalSchema(sql, columns) {
  const kept = [];
  const skipped = {};
  let block = null;
  for (const line of sql.replace(/\r\n/g, "\n").split("\n")) {
    if (block !== null) {
      if (line === COPY_END) {
        if (!block.skipTable) kept.push(line);
        block = null;
        continue;
      }
      if (block.skipTable) {
        skipped[block.table] += 1;
        continue;
      }
      const values = line.split("\t");
      for (const index of block.dropped) {
        if (values[index] !== NULL_VALUE) {
          const key = `${block.table}.${block.names[index]}`;
          skipped[key] = (skipped[key] ?? 0) + 1;
        }
      }
      kept.push(values.filter((_, i) => !block.dropped.has(i)).join("\t"));
      continue;
    }
    const start = COPY_START.exec(line);
    if (start === null) {
      kept.push(line);
      continue;
    }
    const table = `${start[1]}.${start[2]}`;
    const local = columns.get(table);
    if (local === undefined) {
      block = { table, skipTable: true };
      skipped[table] = 0;
      continue;
    }
    const names = start[3]
      .split(", ")
      .map((name) => name.replace(/^"|"$/g, ""));
    const dropped = new Set(
      names.flatMap((name, i) => (local.has(name) ? [] : [i])),
    );
    block = { table, skipTable: false, names, dropped };
    const keptNames = names.filter((_, i) => !dropped.has(i));
    kept.push(
      `COPY "${start[1]}"."${start[2]}" (${keptNames
        .map((name) => `"${name}"`)
        .join(", ")}) FROM stdin;`,
    );
  }
  if (block !== null) {
    throw new BackupError(`The dump ends inside the data of ${block.table}.`);
  }
  return { sql: kept.join("\n"), skipped };
}

/** Reads `--reason <weekly|pre-migration>`; weekly when absent. */
export function readReason(argv) {
  const index = argv.indexOf("--reason");
  if (index === -1) return "weekly";
  const reason = argv[index + 1];
  if (!REASONS.includes(reason)) {
    throw new BackupError(`--reason must be one of: ${REASONS.join(", ")}.`);
  }
  return reason;
}

/**
 * A line safe for the log: the CLI prints a temporary database password in
 * some of its output, which never reaches a file.
 */
export function redact(text) {
  return String(text)
    .replace(/(PGPASSWORD=)"?[^"\s]+"?/g, "$1[redacted]")
    .replace(/postgres(ql)?:\/\/[^\s]+/g, "[connection redacted]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}

/**
 * A Windows path as Git's own programs read it (`C:\Users\x` → `/c/Users/x`).
 * Git's gpg reads GNUPGHOME this way; a Windows path makes it look for a
 * keyring daemon it cannot start.
 */
export function msysPath(windowsPath) {
  const match = /^([A-Za-z]):[\\/](.*)$/.exec(windowsPath);
  if (match === null) return windowsPath.replaceAll("\\", "/");
  return `/${match[1].toLowerCase()}/${match[2].replaceAll("\\", "/")}`;
}
