import { BullModule } from '@nestjs/bull';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { redisConfig } from './config/redis.config';

/** Redis/Bull are opt-in for local dev; set REDIS_ENABLED=true when Redis is running. */
const redisEnabled = process.env.REDIS_ENABLED === 'true';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { QuestionsModule } from './modules/questions/questions.module';
import { PapersModule } from './modules/papers/papers.module';
import { ExamsModule } from './modules/exams/exams.module';
import { GradingModule } from './modules/grading/grading.module';
import { ResultsModule } from './modules/results/results.module';
import { AuditModule } from './modules/audit/audit.module';
import { StudentModule } from './modules/student/student.module';
import { QrEntryModule } from './modules/qr-entry/qr-entry.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { AdminModule } from './modules/admin/admin.module';
import { ReportsModule } from './modules/reports/reports.module';
import { TimerModule } from './modules/timer/timer.module';
import { AppController } from './app.controller';

@Module({
  controllers: [AppController],
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    RedisModule,
    ...(redisEnabled ? [BullModule.forRoot({ redis: redisConfig })] : []),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 10 }]),
    PrismaModule,
    AuthModule,
    UsersModule,
    CategoriesModule,
    QuestionsModule,
    PapersModule,
    ExamsModule,
    GradingModule,
    ResultsModule,
    AuditModule,
    StudentModule,
    QrEntryModule,
    TasksModule,
    AdminModule,
    ReportsModule,
    TimerModule,
  ],
})
export class AppModule {}
