import { Injectable } from "@nestjs/common";

interface StoredValue {
  serialized: string;
  expiresAt?: number;
}

@Injectable()
export class RedisStoreService {
  private readonly store = new Map<string, StoredValue>();

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    const expiresAt = ttlSeconds ? Date.now() + ttlSeconds * 1000 : undefined;
    this.store.set(key, {
      serialized: JSON.stringify(value),
      expiresAt,
    });
  }

  async get<T>(key: string): Promise<T | null> {
    this.cleanupKey(key);
    const stored = this.store.get(key);
    if (!stored) {
      return null;
    }

    return JSON.parse(stored.serialized) as T;
  }

  async del(key: string): Promise<boolean> {
    this.cleanupKey(key);
    return this.store.delete(key);
  }

  async ttl(key: string): Promise<number | null> {
    this.cleanupKey(key);
    const stored = this.store.get(key);
    if (!stored || !stored.expiresAt) {
      return null;
    }

    return Math.max(0, Math.ceil((stored.expiresAt - Date.now()) / 1000));
  }

  async listByPrefix<T>(
    prefix: string,
  ): Promise<Array<{ key: string; value: T }>> {
    this.cleanupExpired();
    return [...this.store.entries()]
      .filter(([key]) => key.startsWith(prefix))
      .map(([key, value]) => ({
        key,
        value: JSON.parse(value.serialized) as T,
      }));
  }

  private cleanupExpired(): void {
    for (const [key, value] of this.store.entries()) {
      if (value.expiresAt && value.expiresAt <= Date.now()) {
        this.store.delete(key);
      }
    }
  }

  private cleanupKey(key: string): void {
    const stored = this.store.get(key);
    if (stored?.expiresAt && stored.expiresAt <= Date.now()) {
      this.store.delete(key);
    }
  }
}
