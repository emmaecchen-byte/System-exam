import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class GenerateQrDto {
  @ApiPropertyOptional({ description: 'Pre-bind QR to a specific candidate user ID' })
  @IsOptional()
  @IsString()
  candidateId?: string;

  @ApiPropertyOptional({
    description: 'Absolute expiration time (ISO 8601). Defaults to session end time.',
  })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @ApiPropertyOptional({
    description: 'Validity in days from now (capped at session end time when later)',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  validityDays?: number;

  @ApiPropertyOptional({
    description: 'Hours until QR expires (alternative to validityDays)',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  expiresInHours?: number;

  @ApiPropertyOptional({
    description: 'Maximum number of scans (null / omitted = unlimited)',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxScans?: number;
}
