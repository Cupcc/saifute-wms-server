import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class AppConfigService {
  constructor(private readonly configService: ConfigService) {}

  get jwtSecret(): string {
    return this.readString("JWT_SECRET", "dev-secret");
  }

  get jwtExpiresInSeconds(): number {
    return this.readNumber("JWT_EXPIRES_IN_SECONDS", 3600);
  }

  get sessionTtlSeconds(): number {
    return this.readNumber("SESSION_TTL_SECONDS", 3600);
  }

  get sessionMaxTtlSeconds(): number {
    return this.readNumber("SESSION_MAX_TTL_SECONDS", 28800);
  }

  get sessionRefreshThresholdSeconds(): number {
    return this.readNumber("SESSION_REFRESH_THRESHOLD_SECONDS", 1200);
  }

  get captchaTtlSeconds(): number {
    return this.readNumber("CAPTCHA_TTL_SECONDS", 300);
  }

  get passwordMaxRetries(): number {
    return this.readNumber("PASSWORD_MAX_RETRIES", 5);
  }

  get passwordLockMinutes(): number {
    return this.readNumber("PASSWORD_LOCK_MINUTES", 15);
  }

  get authIpBlacklist(): string[] {
    const value = this.readString("AUTH_IP_BLACKLIST", "");
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  private readNumber(key: string, fallback: number): number {
    const value = this.configService.get<string>(key);
    const parsed = value ? Number(value) : Number.NaN;
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  private readString(key: string, fallback: string): string {
    return this.configService.get<string>(key) ?? fallback;
  }
}
