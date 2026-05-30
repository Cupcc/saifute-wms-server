import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import {
  chmod,
  mkdir,
  mkdtemp,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { Injectable } from "@nestjs/common";
import { DatabaseBackupSettingsRepository } from "./database-backup-settings.repository";

export interface DatabaseBackupResult {
  databaseName: string;
  backupPath: string;
  checksumPath: string;
  sha256: string;
  sizeBytes: number;
  retainedBackups: string[];
  deletedBackups: string[];
}

interface DatabaseConnectionOptions {
  host: string;
  port: string;
  user: string;
  password: string;
  database: string;
}

const BACKUP_TIMESTAMP_PATTERN = /[:.]/gu;

@Injectable()
export class DatabaseBackupService {
  constructor(
    private readonly settingsRepository: DatabaseBackupSettingsRepository,
  ) {}

  async createFullBackup(): Promise<DatabaseBackupResult> {
    const databaseUrl = process.env.DATABASE_URL?.trim();
    if (!databaseUrl) {
      throw new Error("DATABASE_URL is required for database backup.");
    }

    const runtimeSettings = await this.settingsRepository.readRuntimeSettings();
    const connection = this.parseDatabaseUrl(databaseUrl);
    await mkdir(runtimeSettings.backupDirectory, {
      recursive: true,
    });

    const timestamp = new Date()
      .toISOString()
      .replace(BACKUP_TIMESTAMP_PATTERN, "-");
    const fileBaseName = `${connection.database}-full-${timestamp}`;
    const backupPath = path.join(
      runtimeSettings.backupDirectory,
      `${fileBaseName}.sql`,
    );
    const checksumPath = `${backupPath}.sha256`;

    await this.runDump(connection, backupPath, runtimeSettings.backupCommand);
    const { sha256, sizeBytes } = await this.writeChecksum(
      backupPath,
      checksumPath,
    );
    const retentionResult = await this.pruneOldBackups(
      connection.database,
      runtimeSettings.backupDirectory,
      runtimeSettings.retentionFullCount,
    );

    return {
      databaseName: connection.database,
      backupPath,
      checksumPath,
      sha256,
      sizeBytes,
      retainedBackups: retentionResult.retained,
      deletedBackups: retentionResult.deleted,
    };
  }

  private parseDatabaseUrl(databaseUrl: string): DatabaseConnectionOptions {
    const parsedUrl = new URL(databaseUrl);
    if (parsedUrl.protocol !== "mysql:") {
      throw new Error(
        `Database backup expects mysql DATABASE_URL, received ${parsedUrl.protocol}`,
      );
    }

    const database = parsedUrl.pathname.replace(/^\/+/u, "").trim();
    if (!database) {
      throw new Error("DATABASE_URL must include a database name.");
    }

    return {
      host: parsedUrl.hostname || "127.0.0.1",
      port: parsedUrl.port || "3306",
      user: decodeURIComponent(parsedUrl.username),
      password: decodeURIComponent(parsedUrl.password),
      database,
    };
  }

  private async runDump(
    connection: DatabaseConnectionOptions,
    backupPath: string,
    backupCommand: string,
  ): Promise<void> {
    const tempDirectory = await mkdtemp(
      path.join(tmpdir(), "saifute-wms-db-backup-"),
    );
    const defaultsPath = path.join(tempDirectory, "client.cnf");

    try {
      await writeFile(
        defaultsPath,
        [
          "[client]",
          this.formatClientOption("user", connection.user),
          this.formatClientOption("password", connection.password),
          this.formatClientOption("host", connection.host),
          this.formatClientOption("port", connection.port),
          "protocol=TCP",
          "",
        ].join("\n"),
        { mode: 0o600 },
      );
      await chmod(defaultsPath, 0o600);

      await this.spawnDumpProcess(
        [
          `--defaults-extra-file=${defaultsPath}`,
          "--single-transaction",
          "--routines",
          "--triggers",
          "--events",
          "--default-character-set=utf8mb4",
          "--databases",
          connection.database,
        ],
        backupPath,
        backupCommand,
      );
    } catch (error) {
      await rm(backupPath, { force: true });
      throw error;
    } finally {
      await rm(tempDirectory, { recursive: true, force: true });
    }
  }

  private async spawnDumpProcess(
    args: string[],
    backupPath: string,
    backupCommand: string,
  ): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const dumpProcess = spawn(backupCommand, args, {
        stdio: ["ignore", "pipe", "pipe"],
      });
      const output = createWriteStream(backupPath, {
        flags: "wx",
        mode: 0o600,
      });
      const stderrChunks: Buffer[] = [];

      let processClosed = false;
      let outputFinished = false;

      const resolveIfComplete = () => {
        if (processClosed && outputFinished) {
          resolve();
        }
      };

      dumpProcess.stdout.pipe(output);
      dumpProcess.stderr.on("data", (chunk: Buffer) => {
        stderrChunks.push(chunk);
      });
      dumpProcess.on("error", (error) => {
        output.destroy();
        reject(error);
      });
      dumpProcess.on("close", (code) => {
        if (code === 0) {
          processClosed = true;
          resolveIfComplete();
          return;
        }

        const stderr = Buffer.concat(stderrChunks).toString("utf8").trim();
        reject(
          new Error(
            `Database backup command failed with exit code ${code}${
              stderr ? `: ${stderr}` : "."
            }`,
          ),
        );
      });
      output.on("finish", () => {
        outputFinished = true;
        resolveIfComplete();
      });
      output.on("error", (error) => {
        dumpProcess.kill();
        reject(error);
      });
    });
  }

  private async writeChecksum(backupPath: string, checksumPath: string) {
    const hash = createHash("sha256");
    await new Promise<void>((resolve, reject) => {
      const input = createReadStream(backupPath);
      input.on("data", (chunk: Buffer) => {
        hash.update(chunk);
      });
      input.on("end", resolve);
      input.on("error", reject);
    });
    const sha256 = hash.digest("hex");
    const fileStat = await stat(backupPath);

    await writeFile(checksumPath, `${sha256}  ${path.basename(backupPath)}\n`, {
      mode: 0o600,
    });

    return {
      sha256,
      sizeBytes: fileStat.size,
    };
  }

  private async pruneOldBackups(
    databaseName: string,
    backupDirectory: string,
    retentionFullCount: number,
  ) {
    const entries = await readdir(backupDirectory, { withFileTypes: true });
    const backupFilePattern = new RegExp(
      `^${this.escapeRegExp(databaseName)}-full-.+\\.sql$`,
      "u",
    );
    const backupFiles = entries
      .filter((entry) => entry.isFile() && backupFilePattern.test(entry.name))
      .map((entry) => entry.name)
      .sort()
      .reverse();
    const retained = backupFiles.slice(0, retentionFullCount);
    const deleted = backupFiles.slice(retentionFullCount);

    for (const fileName of deleted) {
      const absolutePath = path.join(backupDirectory, fileName);
      await rm(absolutePath, { force: true });
      await rm(`${absolutePath}.sha256`, { force: true });
    }

    return {
      retained,
      deleted,
    };
  }

  private escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  }

  private formatClientOption(key: string, value: string): string {
    if (/[\r\n]/u.test(value)) {
      throw new Error(`DATABASE_URL ${key} contains an invalid newline.`);
    }

    return `${key}=${value}`;
  }
}
