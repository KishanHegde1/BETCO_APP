import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;
const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class AdminDailyStockQueryDto {
  @ApiPropertyOptional({ example: 'battery' })
  @Transform(trim)
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  categoryId?: string;
}

export class SetDailyStockItemDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  productId!: string;

  @ApiProperty({
    example: 75,
    description: 'Exact available balance for the selected date.',
  })
  @IsInt()
  @Min(0)
  @Max(100000000)
  quantity!: number;
}

export class SetDailyStockDto {
  @ApiProperty({ type: [SetDailyStockItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SetDailyStockItemDto)
  items!: SetDailyStockItemDto[];
}

export class PatchDailyStockDto {
  @ApiProperty({ example: 75 })
  @IsInt()
  @Min(0)
  @Max(100000000)
  quantity!: number;
}

export class CopyDailyStockDto {
  @ApiProperty({ example: '2026-07-25', pattern: '^\\d{4}-\\d{2}-\\d{2}$' })
  @Matches(isoDatePattern, {
    message: 'sourceDate must be an ISO date (YYYY-MM-DD).',
  })
  sourceDate!: string;

  @ApiPropertyOptional({ example: false, default: false })
  @IsOptional()
  @IsBoolean()
  overwriteExisting?: boolean;
}

export const isoDateValidation = isoDatePattern;
