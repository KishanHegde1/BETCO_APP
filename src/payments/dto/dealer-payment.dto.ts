import {
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class DealerPaymentDto {
  @IsUUID()
  dealerId!: string;

  @IsDateString()
  paymentDate!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  referenceNumber?: string;
}
