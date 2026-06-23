import { type LoggerService, ValidationPipe } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { WINSTON_MODULE_NEST_PROVIDER } from "nest-winston";
import { registerWebAppStaticAssets } from "./bootstrap/web-app-static-assets";
import { registerFileStorageStaticAssets } from "./modules/file-storage/infrastructure/file-storage-static-assets";
import { applyOpenApiContractPolicies } from "./shared/api-docs";
import { HttpExceptionFilter } from "./shared/common/filters/http-exception.filter";
import { ResponseEnvelopeInterceptor } from "./shared/common/interceptors/response-envelope.interceptor";
import { AppConfigService } from "./shared/config/app-config.service";

export async function setupApp(
  app: NestExpressApplication,
): Promise<AppConfigService> {
  const appConfigService = app.get(AppConfigService);

  app.set("trust proxy", appConfigService.httpTrustProxy);
  app.setGlobalPrefix(appConfigService.apiGlobalPrefix);
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
  const exceptionLogger = app.get<LoggerService>(WINSTON_MODULE_NEST_PROVIDER);
  setupSwagger(app, appConfigService);
  app.useGlobalFilters(new HttpExceptionFilter(exceptionLogger));
  app.useGlobalInterceptors(app.get(ResponseEnvelopeInterceptor));
  await registerFileStorageStaticAssets(app, appConfigService);
  registerWebAppStaticAssets(app, appConfigService);

  return appConfigService;
}

function setupSwagger(
  app: NestExpressApplication,
  appConfigService: AppConfigService,
): void {
  if (!appConfigService.swaggerEnabled) {
    return;
  }

  const swaggerConfig = new DocumentBuilder()
    .setTitle(appConfigService.swaggerTitle)
    .setDescription(appConfigService.swaggerDescription)
    .setVersion(appConfigService.swaggerVersion)
    .addBearerAuth(
      {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description: "输入 JWT 访问令牌，Swagger UI 会自动补上 Bearer 前缀。",
      },
      "bearer",
    )
    .build();

  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig, {
    deepScanRoutes: true,
    ignoreGlobalPrefix: false,
    autoTagControllers: true,
  });

  applyOpenApiContractPolicies(
    app,
    swaggerDocument,
    appConfigService.apiGlobalPrefix,
  );

  SwaggerModule.setup(appConfigService.swaggerPath, app, swaggerDocument, {
    useGlobalPrefix: true,
    raw: ["json"],
    jsonDocumentUrl: appConfigService.swaggerJsonPath,
    customSiteTitle: `${appConfigService.swaggerTitle} Swagger`,
    swaggerOptions: {
      persistAuthorization: true,
      displayRequestDuration: true,
      tagsSorter: "alpha",
      operationsSorter: "alpha",
    },
  });
}
