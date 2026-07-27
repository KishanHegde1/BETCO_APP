import { IsOptional, IsString, IsUUID } from 'class-validator';

export class DealerProfileDto {
  @IsUUID()
  userId!: string;

  @IsString()
  businessName!: string;

  @IsOptional()
  @IsString()
  phone?: string;
}
