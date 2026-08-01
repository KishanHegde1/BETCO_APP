import {
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Matches,
} from 'class-validator';

/** Creates an internal cash acknowledgement only; it never creates a Tally receipt. */
export class CreateCashDeclarationDto {
  // The mobile client always sends currency using two decimal places, for
  // example "35000.00".  `IsNumberString({ no_symbols: true })` rejects the
  // decimal point, so accept standard positive monetary values explicitly.
  @Matches(/^\d+(?:\.\d{1,2})?$/, {
    message: 'amount must be a positive amount with up to two decimal places',
  })
  @IsNotEmpty()
  amount!: string;

  @IsOptional()
  @IsDateString()
  cashGivenAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
