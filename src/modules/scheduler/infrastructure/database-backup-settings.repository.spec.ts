import * as path from "node:path";
import type { AppConfigService } from "../../../shared/config/app-config.service";
import type { PrismaService } from "../../../shared/prisma/prisma.service";
import { DatabaseBackupSettingsRepository } from "./database-backup-settings.repository";

describe("DatabaseBackupSettingsRepository", () => {
  it("reads runtime values from sys_config and clamps retention to two", async () => {
    const repository = new DatabaseBackupSettingsRepository(
      {
        sysConfig: {
          findMany: jest.fn().mockResolvedValue([
            {
              configKey: "sys.backup.database.full.directory",
              configValue: "custom/backups",
            },
            {
              configKey: "sys.backup.database.full.command",
              configValue: "/opt/homebrew/bin/mysqldump",
            },
            {
              configKey: "sys.backup.database.full.retentionCount",
              configValue: "9",
            },
          ]),
        },
      } as unknown as PrismaService,
      {
        databaseBackupDefaultDirectory: "storage/database-backups",
        databaseBackupDefaultCommand: "mysqldump",
        databaseBackupDefaultRetentionFullCount: 2,
      } as AppConfigService,
    );

    const settings = await repository.readRuntimeSettings();

    expect(settings).toEqual({
      backupDirectory: path.resolve(process.cwd(), "custom/backups"),
      backupCommand: "/opt/homebrew/bin/mysqldump",
      retentionFullCount: 2,
    });
  });

  it("falls back to env-backed defaults when sys_config rows are missing", async () => {
    const repository = new DatabaseBackupSettingsRepository(
      {
        sysConfig: {
          findMany: jest.fn().mockResolvedValue([]),
        },
      } as unknown as PrismaService,
      {
        databaseBackupDefaultDirectory: "storage/database-backups",
        databaseBackupDefaultCommand: "mysqldump",
        databaseBackupDefaultRetentionFullCount: 2,
      } as AppConfigService,
    );

    const settings = await repository.readRuntimeSettings();

    expect(settings).toEqual({
      backupDirectory: path.resolve(process.cwd(), "storage/database-backups"),
      backupCommand: "mysqldump",
      retentionFullCount: 2,
    });
  });
});
