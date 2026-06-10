import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePaperDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  title!: string;

  @ApiProperty()
  @IsString()
  categoryId!: string;

  @IsOptional()
  @IsString()
  sourceFileId?: string;
}

export class UpdatePaperDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  categoryId?: string;
}

export class AddPaperQuestionsDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  questionIds!: string[];

  @ApiPropertyOptional({ description: 'Override score per question; defaults to question bank score' })
  @IsOptional()
  scores?: Record<string, number>;
}

export class UpdatePaperQuestionScoreDto {
  @ApiProperty()
  @IsNumber()
  @Min(0.01)
  score!: number;
}

export class ReorderPaperQuestionsDto {
  @ApiProperty({ type: [Object] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuestionOrderItem)
  orders!: QuestionOrderItem[];
}

export class QuestionOrderItem {
  @IsString()
  questionId!: string;

  @IsInt()
  @Min(0)
  sortOrder!: number;
}

export class QueryPaperDto {
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
