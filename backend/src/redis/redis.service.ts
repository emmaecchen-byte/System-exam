import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';
import { redisConfig } from '../config/redis.config';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis | null = null;
  private available = false;

  async onModuleInit() {
    if (process.env.REDIS_ENABLED === 'false') {
      this.logger.warn('Redis disabled via REDIS_ENABLED=false — using database fallback mode');
      return;
    }

    const client = new Redis({
      ...redisConfig,
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      retryStrategy: (times) => (times > 3 ? null : Math.min(times * 200, 2000)),
      enableOfflineQueue: false,
    });

    client.on('error', (err) => {
      if (this.available) {
        this.logger.warn(`Redis error: ${err.message}`);
      }
    });

    try {
      await client.connect();
      await client.ping();
      this.client = client;
      this.available = true;
      this.logger.log(`Redis connected at ${redisConfig.host}:${redisConfig.port}`);
    } catch (err) {
      this.logger.warn(
        `Redis unavailable (${err instanceof Error ? err.message : err}) — falling back to database mode`,
      );
      client.disconnect();
    }
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.quit();
      this.client = null;
      this.available = false;
    }
  }

  isAvailable(): boolean {
    return this.available && this.client != null;
  }

  getClient(): Redis | null {
    return this.client;
  }

  async get(key: string): Promise<string | null> {
    if (!this.isAvailable()) return null;
    try {
      return await this.client!.get(key);
    } catch (err) {
      this.markUnavailable(err);
      return null;
    }
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<boolean> {
    if (!this.isAvailable()) return false;
    try {
      if (ttlSeconds != null && ttlSeconds > 0) {
        await this.client!.set(key, value, 'EX', Math.ceil(ttlSeconds));
      } else {
        await this.client!.set(key, value);
      }
      return true;
    } catch (err) {
      this.markUnavailable(err);
      return false;
    }
  }

  async del(...keys: string[]): Promise<boolean> {
    if (!this.isAvailable() || keys.length === 0) return false;
    try {
      await this.client!.del(...keys);
      return true;
    } catch (err) {
      this.markUnavailable(err);
      return false;
    }
  }

  async getJson<T>(key: string): Promise<T | null> {
    const raw = await this.get(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  async setJson(key: string, value: unknown, ttlSeconds?: number): Promise<boolean> {
    return this.set(key, JSON.stringify(value), ttlSeconds);
  }

  async sadd(key: string, member: string): Promise<boolean> {
    if (!this.isAvailable()) return false;
    try {
      await this.client!.sadd(key, member);
      return true;
    } catch (err) {
      this.markUnavailable(err);
      return false;
    }
  }

  async srem(key: string, member: string): Promise<boolean> {
    if (!this.isAvailable()) return false;
    try {
      await this.client!.srem(key, member);
      return true;
    } catch (err) {
      this.markUnavailable(err);
      return false;
    }
  }

  async smembers(key: string): Promise<string[]> {
    if (!this.isAvailable()) return [];
    try {
      return await this.client!.smembers(key);
    } catch (err) {
      this.markUnavailable(err);
      return [];
    }
  }

  private markUnavailable(err: unknown) {
    if (!this.available) return;
    this.available = false;
    this.logger.warn(
      `Redis operation failed (${err instanceof Error ? err.message : err}) — switching to database fallback mode`,
    );
  }
}
