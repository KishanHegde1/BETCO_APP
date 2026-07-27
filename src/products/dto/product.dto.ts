import { IsBoolean, IsString, IsUUID, MaxLength } from 'class-validator';

export class ProductDto {
  @IsString()
  @MaxLength(100)
  sku!: string;

  @IsUUID()
  categoryId!: string;

  @IsString()
  @MaxLength(255)
  name!: string;

  @IsBoolean()
  isActive!: boolean;
}
