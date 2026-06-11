import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class ResultsQueryDto {
  @IsOptional()
  @IsString()
  examId?: string;

  @IsOptional()
  @IsString()
  sessionId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Transform(({ value }) => (typeof value === 'string' ? value.split(',') : value))
  departmentIds?: string[];

  @IsOptional()
  @IsIn(['ALL', 'PASS', 'FAIL', 'PENDING'])
  result?: 'ALL' | 'PASS' | 'FAIL' | 'PENDING';

  @IsOptional()
  @IsIn(['ALL', 'NOT_STARTED', 'IN_PROGRESS', 'COMPLETED'])
  gradingStatus?: 'ALL' | 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';

  @IsOptional()
  @IsString()
  submittedFrom?: string;

  @IsOptional()
  @IsString()
  submittedTo?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsIn(['submittedAt', 'totalScore', 'candidateName', 'timeSpent'])
  sortBy?: 'submittedAt' | 'totalScore' | 'candidateName' | 'timeSpent';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Transform(({ value }) => (typeof value === 'string' ? value.split(',') : value))
  attemptIds?: string[];
}

export class RegradeAttemptDto {
  @IsString()
  reason!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  adjustedScore?: number;
}
