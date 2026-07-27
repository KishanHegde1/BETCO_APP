import { IsOptional, IsString, MaxLength } from 'class-validator';

export class StaffBillingQueueQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  search?: string;
}
