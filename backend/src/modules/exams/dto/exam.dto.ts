import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateExamDto {
  @ApiProperty()
  @IsString()
  categoryId!: string;

  @ApiProperty({ description: 'Published paper version ID' })
  @IsString()
  paperId!: string;

  @ApiProperty()
  @IsString()
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty()
  @IsNumber()
  @Min(0.01)
  passScore!: number;

  @ApiProperty()
  @IsInt()
  @Min(1)
  durationMinutes!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  allowRetake?: boolean;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxAttempts?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  randomQuestionOrder?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  randomOptionOrder?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showResultToCandidate?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showAnswersToCandidate?: boolean;
}

export class UpdateExamDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  paperId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0.01)
  passScore?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  durationMinutes?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  allowRetake?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  maxAttempts?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  randomQuestionOrder?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  randomOptionOrder?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showResultToCandidate?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showAnswersToCandidate?: boolean;
}

export class QueryExamDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number = 10;
}
