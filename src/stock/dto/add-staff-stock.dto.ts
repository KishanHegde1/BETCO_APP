import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsUUID, Min } from 'class-validator';

/** Staff may only submit an increment, never an absolute stock value. */
export class AddStaffStockDto {
  @IsUUID()
  productId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantityToAdd!: number;

  @IsDateString()
  stockDate!: string;
}
