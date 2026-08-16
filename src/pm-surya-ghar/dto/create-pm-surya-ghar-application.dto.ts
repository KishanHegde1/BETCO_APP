import { Type } from 'class-transformer';
import {
  IsEmail,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreatePmSuryaGharApplicationDto {
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  customerName!: string;

  @IsString()
  @Matches(/^[0-9]{10,15}$/, {
    message: 'customerPhone must contain 10 to 15 digits.',
  })
  customerPhone!: string;

  @IsOptional()
  @IsString()
  @Matches(/^[0-9]{10,15}$/, {
    message: 'alternatePhone must contain 10 to 15 digits.',
  })
  alternatePhone?: string | null;

  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string | null;

  @IsString()
  @MinLength(5)
  @MaxLength(500)
  addressLine1!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  addressLine2?: string | null;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  city!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  district!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  state!: string;

  @IsString()
  @Matches(/^[0-9]{6}$/, { message: 'pincode must contain exactly 6 digits.' })
  pincode!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  electricityConsumerNumber?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  electricityProvider?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(999999.99)
  sanctionedLoadKw?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;
}
