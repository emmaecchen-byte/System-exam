import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class GradingQueueQueryDto {
  @IsOptional()
  @IsString()
  examId?: string;

  @IsOptional()
  @IsString()
  sessionId?: string;

  @IsOptional()
  @IsIn(['pending', 'in_progress', 'completed', 'all'])
  status?: 'pending' | 'in_progress' | 'completed' | 'all';

  @IsOptional()
  @IsString()
  search?: string;
}

export class GradeAnswerDto {
  @IsNumber()
  @Min(0)
  manualScore!: number;

  @IsOptional()
  @IsString()
  reviewComment?: string;

  @IsOptional()
  @IsBoolean()
  markedForReview?: boolean;
}

export class AssignGraderDto {
  @IsString()
  graderId!: string;
}

export class SubmitGradingDto {
  @IsOptional()
  @IsBoolean()
  needsQualityReview?: boolean;
}
