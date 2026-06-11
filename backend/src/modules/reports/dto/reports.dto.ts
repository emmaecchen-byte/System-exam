import { Type } from 'class-transformer';
import { IsIn, IsOptional, IsString } from 'class-validator';

export class ExamReportQueryDto {
  @IsString()
  examId!: string;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;
}

export class CategoryTrendQueryDto {
  @IsString()
  categoryId!: string;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;

  @IsOptional()
  @IsIn(['day', 'week', 'month'])
  interval?: 'day' | 'week' | 'month';
}

export class ReportsSummaryQueryDto {
  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;
}
