import * as fs from "node:fs";
import * as path from "node:path";
import type { WinstonModuleOptions } from "nest-winston";
import { utilities as nestWinstonModuleUtilities } from "nest-winston";
import * as winston from "winston";

import DailyRotateFile = require("winston-daily-rotate-file");

import { AppConfigService } from "../config/app-config.service";

const META_STRIP_CONTEXTS = new Set(["HTTP", "Bootstrap"]);

export const stripLowValueDefaultMetaFields = <
  T extends Record<string, unknown>,
>(
  info: T,
): T => {
  if (!META_STRIP_CONTEXTS.has(String(info.context ?? ""))) {
    return info;
  }

  delete info.app;
  delete info.environment;
  return info;
};

const ensureDir = (dirPath: string): void => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

const attachTransportErrorHandler = (
  transportName: string,
  transport: {
    on(event: "error", listener: (error: Error) => void): unknown;
  },
): void => {
  transport.on("error", (error) => {
    const message = error.stack ?? error.message;
    process.stderr.write(`[logger:${transportName}] ${message}\n`);
  });
};

const createDailyRotateTransport = (
  transportName: string,
  options: DailyRotateFile.DailyRotateFileTransportOptions,
): DailyRotateFile => {
  const transport = new DailyRotateFile(options);
  attachTransportErrorHandler(transportName, transport);
  return transport;
};

export const createWinstonModuleOptions = (
  appConfigService: AppConfigService,
): WinstonModuleOptions => {
  const logDir = appConfigService.logDirPath;
  ensureDir(logDir);
  const stripLowValueDefaultMeta = winston.format((info) =>
    stripLowValueDefaultMetaFields(info),
  )();

  const consoleFormat = winston.format.combine(
    stripLowValueDefaultMeta,
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    winston.format.ms(),
    nestWinstonModuleUtilities.format.nestLike(appConfigService.appName, {
      colors: appConfigService.environment === "development",
      prettyPrint: appConfigService.environment === "development",
      processId: false,
      appName: false,
    }),
  );

  const fileFormat = winston.format.combine(
    stripLowValueDefaultMeta,
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    winston.format.errors({ stack: true }),
    winston.format.json(),
  );

  const httpFilter = winston.format((info) =>
    info.context === "HTTP" ? info : false,
  )();

  const appTransport = createDailyRotateTransport("app", {
    filename: path.join(logDir, "app-%DATE%.jsonl"),
    datePattern: "YYYY-MM-DD",
    maxSize: "20m",
    maxFiles: "14d",
    level: appConfigService.logLevel,
    format: fileFormat,
  });

  const httpTransport = createDailyRotateTransport("http", {
    filename: path.join(logDir, "http-%DATE%.jsonl"),
    datePattern: "YYYY-MM-DD",
    maxSize: "20m",
    maxFiles: "30d",
    format: winston.format.combine(httpFilter, fileFormat),
  });

  const errorTransport = createDailyRotateTransport("error", {
    filename: path.join(logDir, "error-%DATE%.jsonl"),
    datePattern: "YYYY-MM-DD",
    level: "error",
    maxSize: "20m",
    maxFiles: "30d",
    format: fileFormat,
  });

  const exceptionTransport = createDailyRotateTransport("exceptions", {
    filename: path.join(logDir, "exceptions-%DATE%.jsonl"),
    datePattern: "YYYY-MM-DD",
    maxSize: "20m",
    maxFiles: "30d",
    format: fileFormat,
  });

  const rejectionTransport = createDailyRotateTransport("rejections", {
    filename: path.join(logDir, "rejections-%DATE%.jsonl"),
    datePattern: "YYYY-MM-DD",
    maxSize: "20m",
    maxFiles: "30d",
    format: fileFormat,
  });

  return {
    exitOnError: false,
    level: appConfigService.logLevel,
    defaultMeta: {
      app: appConfigService.appName,
      environment: appConfigService.environment,
    },
    transports: [
      new winston.transports.Console({
        format: consoleFormat,
        level: appConfigService.logLevel,
      }),
      appTransport,
      httpTransport,
      errorTransport,
    ],
    exceptionHandlers: [exceptionTransport],
    rejectionHandlers: [rejectionTransport],
  };
};
