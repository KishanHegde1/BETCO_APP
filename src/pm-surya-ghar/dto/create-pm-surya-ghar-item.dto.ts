import { Type } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

import { PmSuryaGharItemUnit } from '../../entities/pm-surya-ghar-item.entity';

export class CreatePmSuryaGharItemDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  itemName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  brand?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  serialNumber?: string | null;

  @IsEnum(PmSuryaGharItemUnit)
  unit!: PmSuryaGharItemUnit;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  @Max(999999.999)
  quantity!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(9999999999.99)
  unitPrice!: number;
}
