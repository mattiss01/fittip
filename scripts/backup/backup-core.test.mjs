import { describe, expect, it } from "vitest";

import {
  BackupError,
  backupFileName,
  backupTakenAt,
  expiredBackups,
  fitToLocalSchema,
  isInside,
  isLeftoverDump,
  msysPath,
  readBackupConfig,
  readReason,
  redact,
} from "./backup-core.mjs";

const FINGERPRINT = "0123456789ABCDEF0123456789ABCDEF01234567";
const PLACES = {
  oneDrive: "C:\\Users\\owner\\OneDrive",
  localAppData: "C:\\Users\\owner\\AppData\\Local",
};

describe("backup names", () => {
  it("say when, why and at which code", () => {
    const name = backupFileName(
      new Date("2026-11-16T09:15:00.123Z"),
      "weekly",
      "9e5776b",
    );
    expect(name).toBe("fittip-20261116T091500Z-weekly-9e5776b.sql.gpg");
    expect(backupTakenAt(name)).toEqual(new Date("2026-11-16T09:15:00Z"));
  });

  it("refuse an unknown reason or a commit that is not a hash", () => {
    expect(() => backupFileName(new Date(), "daily", "9e5776b")).toThrow(
      BackupError,
    );
    expect(() => backupFileName(new Date(), "weekly", "")).toThrow(BackupError);
  });
});

describe("deleting old backups", () => {
  const now = new Date("2026-12-20T12:00:00Z");

  it("chooses the backups four weeks old, a little early", () => {
    expect(
      expiredBackups(
        [
          "fittip-20261121T115959Z-weekly-9e5776b.sql.gpg",
          "fittip-20261123T000001Z-pre-migration-9e5776b.sql.gpg",
          "fittip-20261201T090000Z-weekly-abcdef0.sql.gpg",
        ],
        now,
      ),
    ).toEqual(["fittip-20261121T115959Z-weekly-9e5776b.sql.gpg"]);
  });

  it("deletes last month's Monday copy on this Monday, though it ran later", () => {
    expect(
      expiredBackups(
        ["fittip-20261123T090030Z-weekly-9e5776b.sql.gpg"],
        new Date("2026-12-21T09:00:25Z"),
      ),
    ).toHaveLength(1);
  });

  it("never chooses a file it did not write", () => {
    expect(
      expiredBackups(
        [
          "notes.txt",
          "fittip-20200101T000000Z-weekly-9e5776b.sql",
          "fittip-20200101T000000Z-weekly-9e5776b.sql.gpg.bak",
          "old-fittip-20200101T000000Z-weekly-9e5776b.sql.gpg",
        ],
        now,
      ),
    ).toEqual([]);
  });
});

describe("the backup configuration", () => {
  const valid = {
    fingerprint: "0123 4567 89ab cdef 0123  4567 89AB CDEF 0123 4567",
    folder: "C:\\Users\\owner\\OneDrive\\FitTip-Backups",
    gnupgHome: "C:\\Users\\owner\\.gnupg",
  };

  it("takes a full fingerprint and a folder inside OneDrive", () => {
    const config = readBackupConfig(valid, PLACES);
    expect(config.fingerprint).toBe(FINGERPRINT);
    expect(config.workDir).toBe(
      "C:\\Users\\owner\\AppData\\Local\\FitTip\\backup-tmp",
    );
  });

  it("refuses a short fingerprint", () => {
    expect(() =>
      readBackupConfig({ ...valid, fingerprint: "89ABCDEF01234567" }, PLACES),
    ).toThrow(/fingerprint/);
  });

  it("refuses a folder outside OneDrive, or OneDrive itself", () => {
    for (const folder of [
      "C:\\Users\\owner\\Documents\\Backups",
      "C:\\Users\\owner\\OneDrive",
      "C:\\Users\\owner\\OneDriveBackups",
      "C:\\Users\\owner\\OneDrive\\..\\Backups",
    ]) {
      expect(() => readBackupConfig({ ...valid, folder }, PLACES)).toThrow(
        /inside OneDrive/,
      );
    }
  });

  it("refuses to work inside OneDrive, where the readable dump would sync", () => {
    expect(() =>
      readBackupConfig(valid, {
        oneDrive: "C:\\Users\\owner",
        localAppData: "C:\\Users\\owner\\AppData\\Local",
      }),
    ).toThrow(BackupError);
  });

  it("refuses to run without OneDrive", () => {
    expect(() =>
      readBackupConfig(valid, { ...PLACES, oneDrive: undefined }),
    ).toThrow(/OneDrive/);
  });
});

describe("paths", () => {
  it("compare as Windows does", () => {
    expect(isInside("c:\\users\\Owner\\onedrive\\x", PLACES.oneDrive)).toBe(
      true,
    );
    expect(isInside("C:\\Users\\owner\\OneDrive2", PLACES.oneDrive)).toBe(
      false,
    );
  });
});

describe("leftovers of an interrupted run", () => {
  it("are the readable dumps, and nothing else", () => {
    expect(isLeftoverDump("fittip-20261116T091500Z-weekly-9e5776b.sql")).toBe(
      true,
    );
    expect(isLeftoverDump("restore.sql")).toBe(true);
    expect(
      isLeftoverDump("fittip-20261116T091500Z-weekly-9e5776b.sql.gpg"),
    ).toBe(false);
    expect(isLeftoverDump("notes.sql")).toBe(false);
  });
});

describe("paths for Git's gpg", () => {
  it("turn a drive path into Git's form", () => {
    expect(msysPath(String.raw`C:\Users\owner\.gnupg`)).toBe(
      "/c/Users/owner/.gnupg",
    );
  });
});

describe("arguments and logging", () => {
  it("reads the reason, weekly by default", () => {
    expect(readReason([])).toBe("weekly");
    expect(readReason(["--reason", "pre-migration"])).toBe("pre-migration");
    expect(() => readReason(["--reason", "now"])).toThrow(BackupError);
  });

  it("keeps the CLI's temporary password out of the log", () => {
    const line = redact(
      'export PGPASSWORD="s3cret-Value"\npostgresql://user:pw@host:5432/db host=x password=libpq-pw failed',
    );
    expect(line).not.toContain("libpq-pw");
    expect(line).not.toContain("s3cret-Value");
    expect(line).not.toContain("user:pw");
  });
});

describe("fitting a dump to the local schema", () => {
  const dump = [
    "SET session_replication_role = replica;",
    'COPY "auth"."users" ("id", "email", "newer_column") FROM stdin;',
    "1\ta@example.test\t\\N",
    "2\tb@example.test\tvalue",
    "\\.",
    'COPY "auth"."scim_users" ("id") FROM stdin;',
    "9",
    "\\.",
    'COPY "public"."profiles" ("user_id", "name") FROM stdin;',
    "1\tAlex\\tSmith",
    "\\.",
    "RESET ALL;",
  ].join("\n");
  const local = new Map([
    ["auth.users", new Set(["id", "email"])],
    ["public.profiles", new Set(["user_id", "name"])],
  ]);

  it("leaves out tables and columns the local schema lacks, and says so", () => {
    const fit = fitToLocalSchema(dump, local);
    expect(fit.sql).toBe(
      [
        "SET session_replication_role = replica;",
        'COPY "auth"."users" ("id", "email") FROM stdin;',
        "1\ta@example.test",
        "2\tb@example.test",
        "\\.",
        'COPY "public"."profiles" ("user_id", "name") FROM stdin;',
        "1\tAlex\\tSmith",
        "\\.",
        "RESET ALL;",
      ].join("\n"),
    );
    expect(fit.skipped).toEqual({
      "auth.users.newer_column": 1,
      "auth.scim_users": 1,
    });
    expect(fit.rows).toEqual({
      '"auth"."users"': 2,
      '"public"."profiles"': 1,
    });
  });

  it("refuses a dump cut off inside a table's data", () => {
    expect(() =>
      fitToLocalSchema('COPY "auth"."users" ("id") FROM stdin;\n1', local),
    ).toThrow(BackupError);
  });
});
