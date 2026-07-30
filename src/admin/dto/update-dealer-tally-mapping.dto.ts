import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/** The exact billing ledger name as it appears in Tally. */
export class UpdateDealerTallyMappingDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  tallyCompanyName!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  tallyLedgerName!: string;
}
