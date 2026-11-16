# Founder-project backups

ADR-043 decision 7 (amended 16 Nov 2026). Every Monday, and before each hosted migration, the
founder project's data is dumped. Each dump is encrypted to the owner's GPG key and written to
`OneDrive\FitTip-Backups`, and copies older than 28 days are deleted. The readable dump only
ever sits in `%LOCALAPPDATA%\FitTip\backup-tmp`, and is deleted whatever happens.

| Command                                        | What                                                           |
| ---------------------------------------------- | -------------------------------------------------------------- |
| `npm.cmd run backup`                           | A weekly copy (needs Docker running)                           |
| `npm.cmd run backup -- --reason pre-migration` | The copy the founder apply takes before `db push`              |
| `npm.cmd run backup:restore -- <file.sql.gpg>` | Restore into the **local** stack only; asks for the passphrase |

Each run appends one line to `%LOCALAPPDATA%\FitTip\backup.log`. The scheduled task also
writes its console output to `%LOCALAPPDATA%\FitTip\task-output.txt`.

## Setting it up again

1. **The key.** The owner's "FitTip backups" key lives in Git's keyring, `C:\Users\<user>\.gnupg`.
   Its private half is in the owner's password manager. On a new machine, run this in Git Bash:
   `gpg --import <that key>`. Never put the private key in OneDrive.
2. **The configuration**, `%USERPROFILE%\.fittip-backup.json`. Nothing in it is secret:

   ```json
   {
     "fingerprint": "<the key's 40-character fingerprint>",
     "folder": "C:\\Users\\<user>\\OneDrive\\FitTip-Backups",
     "gnupgHome": "C:\\Users\\<user>\\.gnupg"
   }
   ```

3. **The scheduled task** "FitTip weekly backup", created with `schtasks /Create /XML`:
   - **When:** weekly, Monday 09:00, and as soon as possible after a missed start.
   - **Who:** runs as the owner, only while logged on, with least privilege, and only with a
     network connection.
   - **What:** `cmd.exe /c npm.cmd run backup > "%LOCALAPPDATA%\FitTip\task-output.txt" 2>&1`,
     in the repository folder.

## Restoring

`backup:restore` resets the local database to the migrations, then loads the data as the local
superuser. It checks each table's row count against the backup. Hosted Auth is newer than the
local stack, so tables and columns the local schema lacks are left out and listed. The local
accounts are replaced by the backup's: afterwards, run `npm.cmd run athletes:seed` and recreate
`owner@fittip.local` as after any reset.

Restoring to the hosted project is not scripted. If it is ever needed, it is the owner's
decision, made at the time.
