import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly client: Redis;
  private readonly logger = new Logger(RedisService.name);
  private destroyed = false;

  constructor(private readonly configService: ConfigService) {
    this.client = new Redis({
      host: this.configService.get<string>('redis.host'),
      port: this.configService.get<number>('redis.port'),
      password: this.configService.get<string>('redis.password') || undefined,
      db: this.configService.get<number>('redis.db'),
      keyPrefix: this.configService.get<string>('redis.keyPrefix'),
      retryStrategy: (times) => {
        if (this.destroyed) return null;
        if (times > 10) return null;
        return Math.min(times * 100, 3000);
      },
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: false,
    });

    this.client.on('connect', () => {
      this.logger.log('Redis connected');
    });

    this.client.on('error', (error) => {
      if (!this.destroyed) {
        this.logger.error('Redis error', error.stack);
      }
    });

    this.client.on('reconnecting', () => {
      if (!this.destroyed) {
        this.logger.warn('Redis reconnecting');
      }
    });
  }

  async onModuleDestroy() {
    this.destroyed = true;
    try {
      await this.client.quit();
      this.logger.log('Redis disconnected');
    } catch {
      this.client.disconnect();
    }
  }

  async isHealthy(): Promise<{ healthy: boolean; latencyMs: number }> {
    const start = Date.now();
    try {
      const result = await this.client.ping();
      return {
        healthy: result === 'PONG',
        latencyMs: Date.now() - start,
      };
    } catch {
      return { healthy: false, latencyMs: Date.now() - start };
    }
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async set(key: string, value: string, ttl?: number): Promise<void> {
    if (ttl) {
      await this.client.set(key, value, 'EX', ttl);
    } else {
      await this.client.set(key, value);
    }
  }

  async getJson<T>(key: string): Promise<T | null> {
    const raw = await this.client.get(key);
    if (raw === null) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  async setJson<T>(key: string, value: T, ttl?: number): Promise<void> {
    const serialized = JSON.stringify(value);
    if (ttl) {
      await this.client.set(key, serialized, 'EX', ttl);
    } else {
      await this.client.set(key, serialized);
    }
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  async exists(key: string): Promise<boolean> {
    const result = await this.client.exists(key);
    return result === 1;
  }

  async setHash(key: string, data: Record<string, string>): Promise<void> {
    await this.client.hset(key, data);
  }

  async getHash(key: string): Promise<Record<string, string>> {
    return this.client.hgetall(key);
  }

  async increment(key: string): Promise<number> {
    return this.client.incr(key);
  }

  async decrement(key: string): Promise<number> {
    return this.client.decr(key);
  }

  async addToSet(key: string, ...values: string[]): Promise<number> {
    return this.client.sadd(key, ...values);
  }

  async getSetMembers(key: string): Promise<string[]> {
    return this.client.smembers(key);
  }

  async removeFromSet(key: string, ...values: string[]): Promise<number> {
    return this.client.srem(key, ...values);
  }

  async setWithExpiry(key: string, value: string, ttlSeconds: number): Promise<void> {
    await this.client.setex(key, ttlSeconds, value);
  }

  getClient(): Redis {
    return this.client;
  }
}
