import {
  IsDateString,
  IsNotEmpty,
  IsNumberString,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/** Creates an internal cash acknowledgement only; it never creates a Tally receipt. */
export class CreateCashDeclarationDto {
  @IsNumberString({ no_symbols: true })
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
