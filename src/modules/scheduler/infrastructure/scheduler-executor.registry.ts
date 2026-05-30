import { Injectable } from "@nestjs/common";
import { ReportingService } from "../../reporting/application/reporting.service";
import { DatabaseBackupService } from "./database-backup.service";

export interface SchedulerExecutorDefinition {
  invokeTarget: string;
  description: string;
}

export interface SchedulerExecutorResult {
  summary: string;
  payload?: unknown;
}

@Injectable()
export class SchedulerExecutorRegistry {
  constructor(
    private readonly reportingService: ReportingService,
    private readonly databaseBackupService: DatabaseBackupService,
  ) {}

  listExecutors(): SchedulerExecutorDefinition[] {
    return [
      {
        invokeTarget: "system.noop",
        description: "No-op executor used for scheduler smoke tests.",
      },
      {
        invokeTarget: "reporting.home-dashboard",
        description:
          "Refresh the reporting home dashboard read model snapshot.",
      },
      {
        invokeTarget: "database.full-backup",
        description:
          "Create a full MySQL backup for the configured WMS database and prune backups using system-config values.",
      },
    ];
  }

  hasExecutor(invokeTarget: string): boolean {
    return this.listExecutors().some(
      (executor) => executor.invokeTarget === invokeTarget,
    );
  }

  async runExecutor(invokeTarget: string): Promise<SchedulerExecutorResult> {
    switch (invokeTarget) {
      case "system.noop":
        return {
          summary: "No-op executor completed successfully.",
          payload: {
            ok: true,
          },
        };
      case "reporting.home-dashboard": {
        const dashboard = await this.reportingService.getHomeDashboard();
        return {
          summary: "Reporting home dashboard refreshed.",
          payload: dashboard,
        };
      }
      case "database.full-backup": {
        const backup = await this.databaseBackupService.createFullBackup();
        return {
          summary: "Database full backup completed.",
          payload: {
            databaseName: backup.databaseName,
            backupPath: backup.backupPath,
            checksumPath: backup.checksumPath,
            sha256: backup.sha256,
            sizeBytes: backup.sizeBytes,
            retainedBackups: backup.retainedBackups,
            deletedBackups: backup.deletedBackups,
          },
        };
      }
      default:
        throw new Error(`Unsupported invokeTarget: ${invokeTarget}`);
    }
  }
}
