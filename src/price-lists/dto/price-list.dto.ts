import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

class PriceListItemInputDto {
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  modelName!: string;

  @Type(() => Number)
  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2 })
  @Min(0)
  @Max(9999999999.99)
  netEffectivePrice?: number;

  @Type(() => Number)
  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 3 })
  @Min(0)
  @Max(100)
  gstRate?: number;

  @Type(() => Number)
  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2 })
  @Min(0)
  @Max(9999999999.99)
  gstAmount?: number;

  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2 })
  @Min(0)
  @Max(9999999999.99)
  gstIncludedPrice!: number;

  @Type(() => Number)
  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2 })
  @Min(0)
  @Max(9999999999.99)
  mrp?: number;
}

export class PreviewPriceListDto {
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name!: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(255)
  supplier?: string;

  @IsDateString()
  effectiveDate!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PriceListItemInputDto)
  items!: PriceListItemInputDto[];
}

export class ImportPriceListDto extends PreviewPriceListDto {
  @IsOptional()
  @IsBoolean()
  activate = true;
}

export { PriceListItemInputDto };
