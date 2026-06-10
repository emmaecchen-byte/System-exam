import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
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
import { AppController } from './app.controller';

@Module({
  controllers: [AppController],
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
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
  ],
})
export class AppModule {}
