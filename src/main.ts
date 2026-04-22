import "reflect-metadata";
import type { LoggerService } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { WINSTON_MODULE_NEST_PROVIDER } from "nest-winston";
import { AppModule } from "./app.module";
import { setupApp } from "./app.setup";
import { buildDevelopmentStartupMessage } from "./bootstrap/development-startup-message";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });
  const logger = app.get<LoggerService>(WINSTON_MODULE_NEST_PROVIDER);
  app.useLogger(logger);
  app.flushLogs();
  const appConfigService = await setupApp(app);

  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  await app.listen(port);

  if (appConfigService.environment === "development") {
    logger.log(
      buildDevelopmentStartupMessage(await app.getUrl(), appConfigService),
      "Bootstrap",
    );
  }
}

void bootstrap().catch((error: unknown) => {
  const message =
    error instanceof Error ? (error.stack ?? error.message) : String(error);
  console.error("Bootstrap failed:", message);
  process.exit(1);
});
