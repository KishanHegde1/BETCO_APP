import { Type } from 'class-transformer';
import { IsNumber, Max, Min } from 'class-validator';

/** A staff-visible internal reference price for one active stock product. */
export class UpdateStockUnitPriceDto {
  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2 })
  @Min(0)
  @Max(9999999999.99)
  unitPrice!: number;
}
