import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsUUID, Min } from 'class-validator';

/** Staff submits a positive requested reduction; the service prevents negatives. */
export class ReduceStaffStockDto {
  @IsUUID()
  productId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantityToReduce!: number;

  @IsDateString()
  stockDate!: string;
}
