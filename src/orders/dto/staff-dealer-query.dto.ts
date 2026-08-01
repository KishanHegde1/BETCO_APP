import { IsOptional, IsString, MaxLength } from 'class-validator';

export class StaffDealerQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}
