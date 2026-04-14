import * as path from "node:path";
import type { ConfigService } from "@nestjs/config";
import { AppConfigService } from "./app-config.service";

const createConfigServiceStub = (
  values: Record<string, string | undefined>,
): ConfigService =>
  ({
    get: jest.fn((key: string) => values[key]),
  }) as unknown as ConfigService;

describe("AppConfigService", () => {
  it("initializes parsed readonly values during construction", () => {
    const service = new AppConfigService(
      createConfigServiceStub({
        APP_NAME: " custom-app ",
        NODE_ENV: " local ",
        HTTP_TRUST_PROXY: " 2 ",
        API_GLOBAL_PREFIX: "/v1/",
        SWAGGER_ENABLED: " false ",
        JWT_REFRESH_SECRET: " refresh-secret ",
        JWT_REFRESH_EXPIRES_IN_SECONDS: " 7200 ",
        REDIS_PASSWORD: "   ",
        AUTH_IP_BLACKLIST: " 10.0.0.1, 10.0.0.2 ,, ",
        FILE_STORAGE_ROOT_PATH: "storage/files",
        FILE_STORAGE_PUBLIC_PREFIX: "profile/",
        FILE_STORAGE_ALLOWED_EXTENSIONS: " JPG, .Pdf ,png ",
        BUSINESS_TIMEZONE: "Asia/Tokyo",
        LOG_DIR: "logs/custom",
        AI_ASSISTANT_API_KEY: " secret ",
      }),
    );

    expect(service.appName).toBe("custom-app");
    expect(service.environment).toBe("local");
    expect(service.httpTrustProxy).toBe(2);
    expect(service.apiGlobalPrefix).toBe("v1");
    expect(service.swaggerEnabled).toBe(false);
    expect(service.swaggerTitle).toBe("custom-app API");
    expect(service.jwtRefreshSecret).toBe("refresh-secret");
    expect(service.jwtRefreshExpiresInSeconds).toBe(7200);
    expect(service.redisPassword).toBeNull();
    expect(service.authIpBlacklist).toEqual(["10.0.0.1", "10.0.0.2"]);
    expect(service.fileStorageRootPath).toBe(
      path.resolve(process.cwd(), "storage/files"),
    );
    expect(service.uploadRootPath).toBe(service.fileStorageRootPath);
    expect(service.profilePublicPrefix).toBe("/profile");
    expect(service.fileAllowedExtensions).toEqual([".jpg", ".pdf", ".png"]);
    expect(service.businessTimezone).toBe("Asia/Tokyo");
    expect(service.schedulerTimezone).toBe("Asia/Tokyo");
    expect(service.logLevel).toBe("debug");
    expect(service.logDirPath).toBe(path.resolve(process.cwd(), "logs/custom"));
    expect(service.aiAssistantApiKey).toBe("secret");
    expect(Object.isFrozen(service.authIpBlacklist)).toBe(true);
    expect(Object.isFrozen(service.fileAllowedExtensions)).toBe(true);
  });

  it("derives environment-based defaults when explicit values are missing", () => {
    const developmentService = new AppConfigService(
      createConfigServiceStub({
        NODE_ENV: "development",
      }),
    );
    const testService = new AppConfigService(
      createConfigServiceStub({
        NODE_ENV: "test",
      }),
    );
    const productionService = new AppConfigService(
      createConfigServiceStub({
        NODE_ENV: "production",
      }),
    );

    expect(developmentService.swaggerEnabled).toBe(true);
    expect(developmentService.logLevel).toBe("debug");
    expect(developmentService.httpTrustProxy).toBe("loopback");
    expect(testService.swaggerEnabled).toBe(false);
    expect(testService.logLevel).toBe("info");
    expect(testService.httpTrustProxy).toBe("loopback");
    expect(productionService.swaggerEnabled).toBe(false);
    expect(productionService.logLevel).toBe("info");
    expect(productionService.httpTrustProxy).toBe(false);
    expect(productionService.jwtRefreshSecret).toBe("dev-secret:refresh");
    expect(productionService.jwtRefreshExpiresInSeconds).toBe(28800);
  });

  it("falls back to UPLOAD_ROOT_PATH when FILE_STORAGE_ROOT_PATH is absent", () => {
    const service = new AppConfigService(
      createConfigServiceStub({
        UPLOAD_ROOT_PATH: "legacy-upload-root",
      }),
    );

    expect(service.fileStorageRootPath).toBe(
      path.resolve(process.cwd(), "legacy-upload-root"),
    );
    expect(service.uploadRootPath).toBe(service.fileStorageRootPath);
  });
});
