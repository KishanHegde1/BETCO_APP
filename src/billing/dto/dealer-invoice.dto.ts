import { IsDateString, IsString, IsUUID, MaxLength } from 'class-validator';

/** Read-only invoice shape reserved for future Tally synchronization. */
export class DealerInvoiceDto {
  @IsUUID()
  dealerId!: string;

  @IsString()
  @MaxLength(100)
  invoiceNumber!: string;

  @IsDateString()
  invoiceDate!: string;
}
