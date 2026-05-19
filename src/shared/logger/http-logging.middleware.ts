import { Inject, Injectable, type NestMiddleware } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";
import { WINSTON_MODULE_PROVIDER } from "nest-winston";
import type { Logger } from "winston";
import { resolveRequestIp } from "../common/request-ip.util";

@Injectable()
export class HttpLoggingMiddleware implements NestMiddleware {
  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
  ) {}

  use(request: Request, response: Response, next: NextFunction): void {
    const startedAt = Date.now();

    response.on("finish", () => {
      const durationMs = Date.now() - startedAt;
      const path = request.originalUrl || request.url;
      const ip = resolveRequestIp(request);
      const contentLength = response.getHeader("content-length");
      const level = this.resolveLogLevel(response.statusCode);

      this.logger.log(
        level,
        `${request.method} ${path} ${response.statusCode} ${durationMs}ms`,
        {
          context: "HTTP",
          method: request.method,
          path,
          durationMs,
          ip,
          contentLength:
            typeof contentLength === "number" ||
            typeof contentLength === "string"
              ? contentLength
              : null,
        },
      );
    });

    next();
  }

  private resolveLogLevel(statusCode: number): "info" | "warn" | "error" {
    if (statusCode >= 500) {
      return "error";
    }
    if (statusCode >= 400) {
      return "warn";
    }
    return "info";
  }
}
