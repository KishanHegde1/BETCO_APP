import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class TallyPageQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @IsOptional()
  @IsDateString()
  toDate?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  sortOrder: 'ASC' | 'DESC' = 'DESC';
}

export class TallyInvoiceQueryDto extends TallyPageQueryDto {
  @IsOptional()
  @IsIn(['PENDING', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'UNKNOWN'])
  status?: string;

  @IsOptional()
  @IsIn(['voucherDate', 'amount', 'createdAt'])
  sortBy: 'voucherDate' | 'amount' | 'createdAt' = 'voucherDate';

  @IsOptional()
  @IsUUID()
  dealerId?: string;
}

export class TallyPaymentQueryDto extends TallyPageQueryDto {
  @IsOptional()
  @IsString()
  paymentMode?: string;

  @IsOptional()
  @IsIn(['voucherDate', 'amount', 'createdAt'])
  sortBy: 'voucherDate' | 'amount' | 'createdAt' = 'voucherDate';

  @IsOptional()
  @IsUUID()
  dealerId?: string;
}

export class TallyLedgerQueryDto extends TallyPageQueryDto {
  @IsOptional()
  @IsIn(['mapped', 'unmapped', 'all'])
  mapped: 'mapped' | 'unmapped' | 'all' = 'all';

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  active?: boolean;
}

export class CreateTallyMappingDto {
  @IsUUID()
  dealerId!: string;

  @IsUUID()
  ledgerId!: string;

  @IsOptional()
  @IsBoolean()
  isActive = true;
}

export class UpdateTallyMappingDto {
  @IsOptional()
  @IsUUID()
  dealerId?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
