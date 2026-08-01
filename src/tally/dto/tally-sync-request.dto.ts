import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class TallyCompanySyncDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  guid?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  gstin?: string;
}

export class TallyLedgerSyncDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  sourceKey!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  guid!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  parent?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  gstin?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  dealerCode?: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  openingBalance!: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  closingBalance!: number;
}

export class TallyVoucherItemSyncDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  itemName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  sku?: string;

  @IsNumber({ maxDecimalPlaces: 3 })
  quantity!: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  rate!: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  amount!: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  discountAmount!: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  taxAmount!: number;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  unit?: string;
}

class TallyVoucherSyncBaseDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  sourceKey!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  guid!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  masterId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  alterId?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  voucherNumber!: string;

  @IsDateString()
  voucherDate!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  voucherType!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  partyLedgerName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  partyLedgerGuid?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  partyGstin?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  partyPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  dealerCode?: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  amount!: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  pendingAmount!: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  discountAmount!: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  taxAmount!: number;

  @IsOptional()
  @IsBoolean()
  isCancelled?: boolean;
}

export class TallyInvoiceSyncDto extends TallyVoucherSyncBaseDto {
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => TallyVoucherItemSyncDto)
  items!: TallyVoucherItemSyncDto[];

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  invoicePdfMetadata?: string;
}

export class TallyPaymentSyncDto extends TallyVoucherSyncBaseDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  referenceNumber?: string;
}

export class TallySyncRequestDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  connectorId!: string;

  @ValidateNested()
  @Type(() => TallyCompanySyncDto)
  company!: TallyCompanySyncDto;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  checkpointToken?: string;

  @IsDateString()
  syncStartedAt!: string;

  @IsDateString()
  syncCompletedAt!: string;

  @IsInt()
  @Min(1)
  schemaVersion!: number;

  @IsArray()
  @ArrayMaxSize(5000)
  @ValidateNested({ each: true })
  @Type(() => TallyLedgerSyncDto)
  ledgers!: TallyLedgerSyncDto[];

  @IsArray()
  @ArrayMaxSize(5000)
  @ValidateNested({ each: true })
  @Type(() => TallyInvoiceSyncDto)
  invoices!: TallyInvoiceSyncDto[];

  @IsArray()
  @ArrayMaxSize(5000)
  @ValidateNested({ each: true })
  @Type(() => TallyPaymentSyncDto)
  payments!: TallyPaymentSyncDto[];
}
