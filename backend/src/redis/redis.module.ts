import { Global, Module } from '@nestjs/common';
import { QrTokenCacheService } from '../common/services/qr-token-cache.service';
import { RedisService } from './redis.service';

@Global()
@Module({
  providers: [RedisService, QrTokenCacheService],
  exports: [RedisService, QrTokenCacheService],
})
export class RedisModule {}
