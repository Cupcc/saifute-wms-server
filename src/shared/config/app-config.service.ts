import * as path from "node:path";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class AppConfigService {
  readonly appName: string;
  readonly environment: string;
  readonly httpTrustProxy: string | number | boolean;
  readonly apiGlobalPrefix: string;
  readonly swaggerEnabled: boolean;
  readonly swaggerTitle: string;
  readonly swaggerDescription: string;
  readonly swaggerVersion: string;
  readonly swaggerPath: string;
  readonly swaggerJsonPath: string;
  readonly jwtSecret: string;
  readonly jwtExpiresInSeconds: number;
  readonly jwtRefreshSecret: string;
  readonly jwtRefreshExpiresInSeconds: number;
  readonly sessionTtlSeconds: number;
  readonly sessionMaxTtlSeconds: number;
  readonly sessionRefreshThresholdSeconds: number;
  readonly captchaTtlSeconds: number;
  readonly captchaEnabled: boolean;
  readonly passwordMaxRetries: number;
  readonly passwordLockMinutes: number;
  readonly redisHost: string;
  readonly redisPort: number;
  readonly redisPassword: string | null;
  readonly redisDb: number;
  readonly redisConnectTimeoutMs: number;
  readonly authIpBlacklist: ReadonlyArray<string>;
  readonly fileStorageRootPath: string;
  readonly uploadRootPath: string;
  readonly profilePublicPrefix: string;
  readonly fileUploadMaxSizeBytes: number;
  readonly fileAllowedExtensions: ReadonlyArray<string>;
  readonly businessTimezone: string;
  readonly schedulerEnabled: boolean;
  readonly schedulerTimezone: string;
  readonly logLevel: string;
  readonly logDirPath: string;
  readonly aiAssistantEnabled: boolean;
  readonly aiAssistantBaseUrl: string;
  readonly aiAssistantModel: string;
  readonly aiAssistantApiKey: string | null;
  readonly aiAssistantTimeoutMs: number;

  constructor(private readonly configService: ConfigService) {
    this.appName = this.readString("APP_NAME", "saifute-wms-server");
    this.environment = this.readString("NODE_ENV", "development");
    this.httpTrustProxy = this.resolveTrustProxySetting(
      this.configService.get<string>("HTTP_TRUST_PROXY"),
    );
    this.apiGlobalPrefix = this.normalizeRoutePrefix(
      this.readString("API_GLOBAL_PREFIX", "api"),
    );

    const configuredSwaggerEnabled = this.parseBooleanValue(
      this.configService.get<string>("SWAGGER_ENABLED"),
    );
    this.swaggerEnabled =
      configuredSwaggerEnabled ?? this.isDevelopmentLikeEnvironment();
    this.swaggerTitle = this.readString("SWAGGER_TITLE", `${this.appName} API`);
    this.swaggerDescription = this.readString(
      "SWAGGER_DESCRIPTION",
      `${this.appName} API documentation`,
    );
    this.swaggerVersion = this.readString("SWAGGER_VERSION", "0.1.0");
    this.swaggerPath = this.normalizeRoutePrefix(
      this.readString("SWAGGER_PATH", "docs"),
    );
    this.swaggerJsonPath = this.normalizeRoutePrefix(
      this.readString("SWAGGER_JSON_PATH", "docs-json"),
    );

    this.jwtSecret = this.readString("JWT_SECRET", "dev-secret");
    this.jwtExpiresInSeconds = this.readNumber("JWT_EXPIRES_IN_SECONDS", 3600);
    this.sessionTtlSeconds = this.readNumber("SESSION_TTL_SECONDS", 3600);
    this.sessionMaxTtlSeconds = this.readNumber(
      "SESSION_MAX_TTL_SECONDS",
      28800,
    );
    this.sessionRefreshThresholdSeconds = this.readNumber(
      "SESSION_REFRESH_THRESHOLD_SECONDS",
      1200,
    );
    this.jwtRefreshSecret = this.readString(
      "JWT_REFRESH_SECRET",
      `${this.jwtSecret}:refresh`,
    );
    this.jwtRefreshExpiresInSeconds = this.readNumber(
      "JWT_REFRESH_EXPIRES_IN_SECONDS",
      this.sessionMaxTtlSeconds,
    );
    this.captchaTtlSeconds = this.readNumber("CAPTCHA_TTL_SECONDS", 300);
    this.captchaEnabled = this.readBoolean("CAPTCHA_ENABLED", true);
    this.passwordMaxRetries = this.readNumber("PASSWORD_MAX_RETRIES", 5);
    this.passwordLockMinutes = this.readNumber("PASSWORD_LOCK_MINUTES", 15);

    this.redisHost = this.readString("REDIS_HOST", "127.0.0.1");
    this.redisPort = this.readNumber("REDIS_PORT", 6379);
    this.redisPassword = this.readNullableString("REDIS_PASSWORD");
    this.redisDb = this.readNumber("REDIS_DB", 0);
    this.redisConnectTimeoutMs = this.readNumber(
      "REDIS_CONNECT_TIMEOUT_MS",
      5000,
    );
    this.authIpBlacklist = this.readStringList("AUTH_IP_BLACKLIST", "");

    this.fileStorageRootPath = this.resolvePath(
      this.readFirstString(
        ["FILE_STORAGE_ROOT_PATH", "UPLOAD_ROOT_PATH"],
        "storage",
      ),
    );
    this.uploadRootPath = this.fileStorageRootPath;
    this.profilePublicPrefix = this.normalizePublicPrefix(
      this.readString("FILE_STORAGE_PUBLIC_PREFIX", "/profile"),
    );
    this.fileUploadMaxSizeBytes = this.readNumber(
      "FILE_STORAGE_MAX_SIZE_BYTES",
      5 * 1024 * 1024,
    );
    this.fileAllowedExtensions = this.readStringList(
      "FILE_STORAGE_ALLOWED_EXTENSIONS",
      ".jpg,.jpeg,.png,.gif,.webp,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.zip,.rar",
      (item) => {
        const normalized = item.toLowerCase();
        return normalized.startsWith(".") ? normalized : `.${normalized}`;
      },
    );

    this.businessTimezone = this.readString(
      "BUSINESS_TIMEZONE",
      "Asia/Shanghai",
    );
    this.schedulerEnabled = this.readBoolean("SCHEDULER_ENABLED", true);
    this.schedulerTimezone = this.readString(
      "SCHEDULER_TIMEZONE",
      this.businessTimezone,
    );

    this.logLevel = this.readString(
      "LOG_LEVEL",
      this.isDevelopmentLikeEnvironment() ? "debug" : "info",
    );
    this.logDirPath = this.resolvePath(
      this.readString(
        "LOG_DIR",
        this.isDevelopmentLikeEnvironment() ? "logs-dev" : "logs",
      ),
    );

    this.aiAssistantEnabled = this.readBoolean("AI_ASSISTANT_ENABLED", true);
    this.aiAssistantBaseUrl = this.readString(
      "AI_ASSISTANT_BASE_URL",
      "https://api.openai.com/v1",
    );
    this.aiAssistantModel = this.readString(
      "AI_ASSISTANT_MODEL",
      "gpt-4.1-mini",
    );
    this.aiAssistantApiKey = this.readNullableString("AI_ASSISTANT_API_KEY");
    this.aiAssistantTimeoutMs = this.readNumber(
      "AI_ASSISTANT_TIMEOUT_MS",
      15000,
    );
  }

  private readNumber(key: string, fallback: number): number {
    const raw = this.configService.get<string>(key);
    const value = typeof raw === "string" ? raw.trim() : raw;
    const parsed = value ? Number(value) : Number.NaN;
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  private readBoolean(key: string, fallback: boolean): boolean {
    const parsed = this.parseBooleanValue(this.configService.get<string>(key));
    if (parsed === null) {
      return fallback;
    }
    return parsed;
  }

  private readString(key: string, fallback: string): string {
    const raw = this.configService.get<string>(key);
    if (raw === undefined || raw === null) {
      return fallback.trim();
    }
    return raw.trim();
  }

  private readFirstString(
    keys: ReadonlyArray<string>,
    fallback: string,
  ): string {
    for (const key of keys) {
      const raw = this.configService.get<string>(key);
      if (raw !== undefined && raw !== null) {
        return raw.trim();
      }
    }

    return fallback.trim();
  }

  private readNullableString(key: string): string | null {
    const value = this.readString(key, "");
    return value ? value : null;
  }

  private readStringList(
    key: string,
    fallback: string,
    normalizeItem?: (item: string) => string,
  ): ReadonlyArray<string> {
    const items = this.readString(key, fallback)
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => normalizeItem?.(item) ?? item);

    return Object.freeze(items);
  }

  private parseBooleanValue(value: string | undefined): boolean | null {
    if (typeof value !== "string") {
      return null;
    }

    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) {
      return true;
    }
    if (["0", "false", "no", "off"].includes(normalized)) {
      return false;
    }

    return null;
  }

  private resolveTrustProxySetting(
    value: string | undefined,
  ): string | number | boolean {
    const parsedBoolean = this.parseBooleanValue(value);
    if (parsedBoolean !== null) {
      return parsedBoolean;
    }

    const normalized = value?.trim();
    if (!normalized) {
      return this.shouldTrustLoopbackProxyByDefault() ? "loopback" : false;
    }

    if (/^\d+$/.test(normalized)) {
      return Number(normalized);
    }

    return normalized;
  }

  private resolvePath(value: string): string {
    return path.isAbsolute(value) ? value : path.resolve(process.cwd(), value);
  }

  private isDevelopmentLikeEnvironment(): boolean {
    return ["development", "dev", "local"].includes(
      this.environment.trim().toLowerCase(),
    );
  }

  private shouldTrustLoopbackProxyByDefault(): boolean {
    const normalizedEnvironment = this.environment.trim().toLowerCase();
    return (
      this.isDevelopmentLikeEnvironment() || normalizedEnvironment === "test"
    );
  }

  private normalizeRoutePrefix(value: string): string {
    return value.replace(/^\/+|\/+$/g, "");
  }

  private normalizePublicPrefix(value: string): string {
    const normalized = value.trim().replace(/\/+$/g, "");
    return normalized.startsWith("/") ? normalized : `/${normalized}`;
  }
}
