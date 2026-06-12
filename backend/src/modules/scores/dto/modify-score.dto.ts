import { Type } from 'class-transformer';
import { IsNotEmpty, IsNumber, IsString } from 'class-validator';

export class ModifyScoreDto {
  @Type(() => Number)
  @IsNumber()
  newScore!: number;

  @IsString()
  @IsNotEmpty({ message: 'Reason is required for score modification' })
  reason!: string;
}
