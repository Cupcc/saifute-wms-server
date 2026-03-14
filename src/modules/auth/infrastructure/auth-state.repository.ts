import { Injectable } from "@nestjs/common";
import { AppConfigService } from "../../../shared/config/app-config.service";
import { RedisStoreService } from "../../../shared/redis/redis-store.service";

interface PasswordAttemptState {
  count: number;
  lockedUntil?: string;
}

@Injectable()
export class AuthStateRepository {
  constructor(
    private readonly redisStoreService: RedisStoreService,
    private readonly appConfigService: AppConfigService,
  ) {}

  async storeCaptcha(captchaId: string, captchaCode: string): Promise<void> {
    await this.redisStoreService.set(
      this.buildCaptchaKey(captchaId),
      { captchaCode },
      this.appConfigService.captchaTtlSeconds,
    );
  }

  async consumeCaptcha(
    captchaId: string,
    captchaCode: string,
  ): Promise<boolean> {
    const key = this.buildCaptchaKey(captchaId);
    const stored = await this.redisStoreService.get<{ captchaCode: string }>(
      key,
    );
    await this.redisStoreService.del(key);
    return stored?.captchaCode === captchaCode;
  }

  async getPasswordAttempt(username: string): Promise<PasswordAttemptState> {
    return (
      (await this.redisStoreService.get<PasswordAttemptState>(
        this.buildPasswordAttemptKey(username),
      )) ?? { count: 0 }
    );
  }

  async recordPasswordFailure(username: string): Promise<PasswordAttemptState> {
    const current = await this.getPasswordAttempt(username);
    const nextState: PasswordAttemptState = {
      count: current.count + 1,
    };

    if (nextState.count >= this.appConfigService.passwordMaxRetries) {
      nextState.lockedUntil = new Date(
        Date.now() + this.appConfigService.passwordLockMinutes * 60 * 1000,
      ).toISOString();
    }

    await this.redisStoreService.set(
      this.buildPasswordAttemptKey(username),
      nextState,
      this.appConfigService.passwordLockMinutes * 60,
    );

    return nextState;
  }

  async clearPasswordFailures(username: string): Promise<void> {
    await this.redisStoreService.del(this.buildPasswordAttemptKey(username));
  }

  private buildCaptchaKey(captchaId: string): string {
    return `auth:captcha:${captchaId}`;
  }

  private buildPasswordAttemptKey(username: string): string {
    return `auth:password-attempt:${username}`;
  }
}
