import * as path from "node:path";
import { Injectable } from "@nestjs/common";
import {
  DATABASE_BACKUP_COMMAND_CONFIG_KEY,
  DATABASE_BACKUP_DIRECTORY_CONFIG_KEY,
  DATABASE_BACKUP_RETENTION_FULL_COUNT_CONFIG_KEY,
} from "../../../../prisma/system-management.seed";
import { AppConfigService } from "../../../shared/config/app-config.service";
import { PrismaService } from "../../../shared/prisma/prisma.service";

export interface DatabaseBackupRuntimeSettings {
  backupCommand: string;
  backupDirectory: string;
  retentionFullCount: number;
}

@Injectable()
export class DatabaseBackupSettingsRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly appConfigService: AppConfigService,
  ) {}

  async readRuntimeSettings(): Promise<DatabaseBackupRuntimeSettings> {
    const configs = await this.prisma.sysConfig.findMany({
      where: {
        configKey: {
          in: [
            DATABASE_BACKUP_DIRECTORY_CONFIG_KEY,
            DATABASE_BACKUP_COMMAND_CONFIG_KEY,
            DATABASE_BACKUP_RETENTION_FULL_COUNT_CONFIG_KEY,
          ],
        },
      },
    });
    const valuesByKey = new Map(
      configs.map((config) => [config.configKey, config.configValue]),
    );

    const backupDirectory = this.resolveDirectory(
      valuesByKey.get(DATABASE_BACKUP_DIRECTORY_CONFIG_KEY) ??
        this.appConfigService.databaseBackupDefaultDirectory,
    );
    const backupCommand = this.resolveCommand(
      valuesByKey.get(DATABASE_BACKUP_COMMAND_CONFIG_KEY) ??
        this.appConfigService.databaseBackupDefaultCommand,
    );
    const retentionFullCount = this.resolveRetentionCount(
      valuesByKey.get(DATABASE_BACKUP_RETENTION_FULL_COUNT_CONFIG_KEY) ??
        String(this.appConfigService.databaseBackupDefaultRetentionFullCount),
    );

    return {
      backupCommand,
      backupDirectory,
      retentionFullCount,
    };
  }

  private resolveDirectory(rawValue: string): string {
    const trimmed = rawValue.trim();
    const effectiveValue =
      trimmed || this.appConfigService.databaseBackupDefaultDirectory;
    return path.isAbsolute(effectiveValue)
      ? effectiveValue
      : path.resolve(process.cwd(), effectiveValue);
  }

  private resolveCommand(rawValue: string): string {
    const trimmed = rawValue.trim();
    return trimmed || this.appConfigService.databaseBackupDefaultCommand;
  }

  private resolveRetentionCount(rawValue: string): number {
    const parsed = Number(rawValue.trim());
    if (!Number.isFinite(parsed)) {
      return this.appConfigService.databaseBackupDefaultRetentionFullCount;
    }

    return Math.min(2, Math.max(1, Math.trunc(parsed)));
  }
}
