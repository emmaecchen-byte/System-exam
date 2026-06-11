import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class PublishResultsDto {
  @ApiPropertyOptional({ description: 'Optional note recorded in the audit log' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
