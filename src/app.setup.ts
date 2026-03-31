import { ValidationPipe } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import {
  DocumentBuilder,
  type OpenAPIObject,
  SwaggerModule,
} from "@nestjs/swagger";
import { registerFileStorageStaticAssets } from "./modules/file-storage/infrastructure/file-storage-static-assets";
import { HttpExceptionFilter } from "./shared/common/filters/http-exception.filter";
import { ResponseEnvelopeInterceptor } from "./shared/common/interceptors/response-envelope.interceptor";
import { AppConfigService } from "./shared/config/app-config.service";

type SwaggerOperationMethod = "get" | "post" | "put" | "patch" | "delete";
type SwaggerOperationDescriptor = {
  method: SwaggerOperationMethod;
  path: string;
};
type SwaggerSchemaObject = Record<string, unknown>;
type SwaggerMediaTypeObject = {
  schema?: SwaggerSchemaObject;
};
type SwaggerResponseObject = {
  content?: Record<string, SwaggerMediaTypeObject>;
};
type SwaggerOperationObject = {
  responses?: Record<string, SwaggerResponseObject>;
  security?: unknown[];
};

const SWAGGER_OPERATION_METHODS: ReadonlyArray<SwaggerOperationMethod> = [
  "get",
  "post",
  "put",
  "patch",
  "delete",
];

const PUBLIC_SWAGGER_OPERATIONS: ReadonlyArray<SwaggerOperationDescriptor> = [
  { method: "get", path: "health" },
  { method: "get", path: "auth/captcha" },
  { method: "post", path: "auth/login" },
  { method: "post", path: "auth/logout" },
];

const SKIP_RESPONSE_ENVELOPE_SWAGGER_OPERATIONS: ReadonlyArray<SwaggerOperationDescriptor> =
  [
    { method: "get", path: "files/download" },
    { method: "get", path: "reporting/export" },
    { method: "post", path: "ai/chat" },
  ];

export async function setupApp(
  app: NestExpressApplication,
): Promise<AppConfigService> {
  const appConfigService = app.get(AppConfigService);

  app.setGlobalPrefix(appConfigService.apiGlobalPrefix);
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
  setupSwagger(app, appConfigService);
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(app.get(ResponseEnvelopeInterceptor));
  await registerFileStorageStaticAssets(app, appConfigService);

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

  swaggerDocument.security = [{ bearer: [] }];
  for (const operation of PUBLIC_SWAGGER_OPERATIONS) {
    clearSwaggerOperationSecurity(
      swaggerDocument,
      appConfigService.apiGlobalPrefix,
      operation.path,
      operation.method,
    );
  }
  wrapSwaggerSuccessResponses(
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

function clearSwaggerOperationSecurity(
  swaggerDocument: OpenAPIObject,
  apiGlobalPrefix: string,
  routePath: string,
  method: SwaggerOperationMethod,
): void {
  for (const candidatePath of resolveSwaggerPathCandidates(
    apiGlobalPrefix,
    routePath,
  )) {
    const operation = swaggerDocument.paths[candidatePath]?.[method];
    if (operation) {
      operation.security = [];
    }
  }
}

function wrapSwaggerSuccessResponses(
  swaggerDocument: OpenAPIObject,
  apiGlobalPrefix: string,
): void {
  for (const [routePath, pathItem] of Object.entries(swaggerDocument.paths)) {
    for (const method of SWAGGER_OPERATION_METHODS) {
      const operation = pathItem[method] as SwaggerOperationObject | undefined;
      if (
        !operation ||
        isSwaggerResponseEnvelopeSkipped(apiGlobalPrefix, routePath, method)
      ) {
        continue;
      }

      const responses = operation.responses ?? {};
      for (const [statusCode, response] of Object.entries(responses)) {
        const numericStatusCode = resolveSwaggerStatusCode(statusCode);
        if (
          !response ||
          numericStatusCode === null ||
          numericStatusCode >= 300
        ) {
          continue;
        }

        response.content ??= {};
        const jsonContent = response.content["application/json"] ?? {};
        const currentSchema = jsonContent.schema;

        response.content["application/json"] = {
          ...jsonContent,
          schema: buildSwaggerEnvelopeSchema(currentSchema),
        };
      }
    }
  }
}

function resolveSwaggerPathCandidates(
  apiGlobalPrefix: string,
  routePath: string,
): string[] {
  const candidates = new Set<string>();
  candidates.add(toAbsoluteRoute(routePath));

  const prefixedRoute = joinRouteSegments(apiGlobalPrefix, routePath);
  if (prefixedRoute) {
    candidates.add(toAbsoluteRoute(prefixedRoute));
  }

  return [...candidates];
}

function joinRouteSegments(...segments: string[]): string {
  return segments
    .map((segment) => segment.trim().replace(/^\/+|\/+$/g, ""))
    .filter(Boolean)
    .join("/");
}

function isSwaggerResponseEnvelopeSkipped(
  apiGlobalPrefix: string,
  routePath: string,
  method: SwaggerOperationMethod,
): boolean {
  return SKIP_RESPONSE_ENVELOPE_SWAGGER_OPERATIONS.some(
    (operation) =>
      resolveSwaggerPathCandidates(apiGlobalPrefix, operation.path).includes(
        routePath,
      ) && operation.method === method,
  );
}

function resolveSwaggerStatusCode(statusCode: string): number | null {
  if (!/^\d+$/.test(statusCode)) {
    return null;
  }

  return Number(statusCode);
}

function buildSwaggerEnvelopeSchema(
  dataSchema: SwaggerSchemaObject | undefined,
): SwaggerSchemaObject {
  return {
    type: "object",
    properties: {
      success: {
        type: "boolean",
        example: true,
      },
      code: {
        type: "integer",
        example: 200,
      },
      data: dataSchema ?? {
        type: "object",
      },
    },
    required: ["success", "code", "data"],
  };
}

function toAbsoluteRoute(routePath: string): string {
  const normalizedPath = routePath.trim().replace(/^\/+|\/+$/g, "");
  return normalizedPath ? `/${normalizedPath}` : "/";
}
