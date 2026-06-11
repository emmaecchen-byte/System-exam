import { Injectable } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';

export interface QrTokenCacheEntry {
  sessionId: string;
  expiresAt: string;
  isValid: boolean;
}

const QR_TOKEN_KEY_PREFIX = 'qr:token:';

@Injectable()
export class QrTokenCacheService {
  constructor(private readonly redis: RedisService) {}

  private key(tokenHash: string) {
    return `${QR_TOKEN_KEY_PREFIX}${tokenHash}`;
  }

  async setToken(
    tokenHash: string,
    entry: QrTokenCacheEntry,
    ttlSeconds: number,
  ): Promise<void> {
    if (ttlSeconds <= 0) return;
    await this.redis.setJson(this.key(tokenHash), entry, ttlSeconds);
  }

  async getToken(tokenHash: string): Promise<QrTokenCacheEntry | null> {
    return this.redis.getJson<QrTokenCacheEntry>(this.key(tokenHash));
  }

  async invalidateToken(tokenHash: string): Promise<void> {
    await this.redis.del(this.key(tokenHash));
  }

  async markInvalid(tokenHash: string, entry: QrTokenCacheEntry): Promise<void> {
    const expiresAt = new Date(entry.expiresAt);
    const ttlSeconds = Math.max(1, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
    await this.setToken(tokenHash, { ...entry, isValid: false }, ttlSeconds);
  }
}
