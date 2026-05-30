import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { DatabaseBackupService } from "./database-backup.service";
import type {
  DatabaseBackupRuntimeSettings,
  DatabaseBackupSettingsRepository,
} from "./database-backup-settings.repository";

describe("DatabaseBackupService", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;

  afterEach(() => {
    if (originalDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
      return;
    }
    process.env.DATABASE_URL = originalDatabaseUrl;
  });

  it("creates a full dump, writes checksum, and keeps only two full backups", async () => {
    const tempDirectory = await mkdtemp(
      path.join(tmpdir(), "saifute-wms-backup-spec-"),
    );
    const dumpCommand = path.join(tempDirectory, "fake-mysqldump.sh");
    const backupDirectory = path.join(tempDirectory, "backups");

    await writeFile(
      dumpCommand,
      ["#!/bin/sh", "printf '%s\\n' 'CREATE DATABASE `saifute-wms`;'"].join(
        "\n",
      ),
      { mode: 0o700 },
    );
    await chmod(dumpCommand, 0o700);

    try {
      await mkdir(backupDirectory, { recursive: true });
      await writeFile(
        path.join(backupDirectory, "saifute-wms-full-2026-01-01T00-00-00.sql"),
        "oldest",
        { mode: 0o600 },
      );
      await writeFile(
        `${path.join(
          backupDirectory,
          "saifute-wms-full-2026-01-01T00-00-00.sql",
        )}.sha256`,
        "oldest-checksum",
        { mode: 0o600 },
      );
      await writeFile(
        path.join(backupDirectory, "saifute-wms-full-2026-01-08T00-00-00.sql"),
        "newer",
        { mode: 0o600 },
      );

      process.env.DATABASE_URL =
        "mysql://backup_user:backup_password@127.0.0.1:3306/saifute-wms";
      const service = new DatabaseBackupService({
        readRuntimeSettings: jest.fn<
          Promise<DatabaseBackupRuntimeSettings>,
          []
        >(async () => ({
          backupDirectory,
          backupCommand: dumpCommand,
          retentionFullCount: 2,
        })),
      } as unknown as DatabaseBackupSettingsRepository);

      const result = await service.createFullBackup();

      expect(result.databaseName).toBe("saifute-wms");
      expect(result.retainedBackups).toHaveLength(2);
      expect(result.deletedBackups).toEqual([
        "saifute-wms-full-2026-01-01T00-00-00.sql",
      ]);
      await expect(readFile(result.backupPath, "utf8")).resolves.toContain(
        "CREATE DATABASE",
      );
      await expect(readFile(result.checksumPath, "utf8")).resolves.toContain(
        result.sha256,
      );
      await expect(
        readFile(
          path.join(
            backupDirectory,
            "saifute-wms-full-2026-01-01T00-00-00.sql",
          ),
          "utf8",
        ),
      ).rejects.toThrow();
    } finally {
      await rm(tempDirectory, { recursive: true, force: true });
    }
  });
});
