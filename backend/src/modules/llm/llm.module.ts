import { Module } from '@nestjs/common';
import { DeepSeekGradingService } from './deepseek-grading.service';

@Module({
  providers: [DeepSeekGradingService],
  exports: [DeepSeekGradingService],
})
export class LlmModule {}
