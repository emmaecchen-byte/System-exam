import { BullModule } from '@nestjs/bull';
import { Module, forwardRef } from '@nestjs/common';
import { StudentModule } from '../student/student.module';
import { TIMER_QUEUE } from './timer.constants';
import { TimerProcessor } from './timer.processor';
import { TimerService } from './timer.service';

const redisEnabled = process.env.REDIS_ENABLED === 'true';

@Module({
  imports: [
    ...(redisEnabled ? [BullModule.registerQueue({ name: TIMER_QUEUE })] : []),
    forwardRef(() => StudentModule),
  ],
  providers: [
    TimerService,
    ...(redisEnabled ? [TimerProcessor] : []),
  ],
  exports: [TimerService],
})
export class TimerModule {}
