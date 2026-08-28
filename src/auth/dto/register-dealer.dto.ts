import {
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RegisterDealerDto {
  @IsString()
  @MinLength(3)
  @MaxLength(255)
  username!: string;

  @IsString()
  @Matches(/^\d{10,15}$/, {
    message: 'Phone number must contain 10 to 15 digits.',
  })
  phone!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(255)
  shopName!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  confirmPassword!: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  address?: string;
}
