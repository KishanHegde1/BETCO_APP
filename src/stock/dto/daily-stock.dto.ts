import { IsDateString, IsInt, IsUUID, Min } from 'class-validator';

export class DailyStockDto {
  @IsUUID()
  productId!: string;

  @IsDateString()
  stockDate!: string;

  @IsInt()
  @Min(0)
  quantity!: number;
}
