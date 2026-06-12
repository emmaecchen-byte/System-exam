import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from './common/decorators/current-user.decorator';
import { isDeepSeekConfigured } from './config/deepseek.config';
import { PrismaService } from './prisma/prisma.module';

@ApiTags('Health')
@Controller()
export class AppController {
  constructor(private prisma: PrismaService) {}

  @Public()
  @Get('health')
  async health() {
    await this.prisma.$queryRaw`SELECT 1`;
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      deepseekConfigured: isDeepSeekConfigured(),
    };
  }
}
