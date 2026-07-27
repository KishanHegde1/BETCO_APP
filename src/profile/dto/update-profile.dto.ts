import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';

const trimString = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @Transform(trimString)
  @MinLength(3)
  @MaxLength(255)
  @Matches(/\S/, { message: 'Username cannot be blank.' })
  username?: string;

  @IsOptional()
  @IsString()
  @Transform(trimString)
  @MaxLength(150)
  @Matches(/\S/, { message: 'Shop name cannot be blank.' })
  shopName?: string;

  @IsOptional()
  @IsString()
  @Transform(trimString)
  @MaxLength(20)
  @Matches(/^(?=(?:\D*\d){10,15}\D*$)[0-9+() -]+$/, {
    message:
      'Contact number must contain 10 to 15 digits and use only phone characters.',
  })
  contactNumber?: string;

  @IsOptional()
  @IsString()
  @Transform(trimString)
  @MaxLength(500)
  @Matches(/\S/, { message: 'Address cannot be blank.' })
  address?: string;
}
