import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

const TTL_SECONDS = 10;

@Injectable()
export class CacheService implements OnModuleDestroy {
  private readonly redis: Redis;

  constructor(private readonly config: ConfigService) {
    this.redis = new Redis({
      host: this.config.get<string>('REDIS_HOST', 'redis'),
      port: parseInt(this.config.get<string>('REDIS_PORT', '6379'), 10),
    });
  }

  userVideosKey(userId: string): string {
    return `videos:user:${userId}`;
  }

  async get<T>(key: string): Promise<T | null> {
    const raw = await this.redis.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  }

  async set(key: string, value: unknown): Promise<void> {
    await this.redis.set(key, JSON.stringify(value), 'EX', TTL_SECONDS);
  }

  async del(key: string): Promise<void> {
    await this.redis.del(key);
  }

  onModuleDestroy(): void {
    this.redis.disconnect();
  }
}
