import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class SaveAnswerDto {
  @IsString()
  questionId!: string;

  @IsNotEmpty()
  answerContent!: object;

  @IsOptional()
  @IsBoolean()
  markedForReview?: boolean;
}

export class AnswerItemDto {
  @IsString()
  questionId!: string;

  @IsObject()
  answerContent!: object;

  @IsOptional()
  @IsBoolean()
  markedForReview?: boolean;
}

export class BatchSaveAnswersDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AnswerItemDto)
  answers!: AnswerItemDto[];

  @IsOptional()
  @IsInt()
  @Min(0)
  currentQuestionIndex?: number;
}

export class StartExamDto {
  @IsOptional()
  @IsString()
  sessionId?: string;
}

export class SubmitExamDto {
  @IsOptional()
  @IsString()
  submitType?: 'MANUAL' | 'TIMEOUT';
}

export class CandidateAuditEventDto {
  @IsString()
  eventType!: string;

  @IsOptional()
  @IsString()
  timestamp?: string;

  @IsOptional()
  @IsString()
  action?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  duration_seconds?: number;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
