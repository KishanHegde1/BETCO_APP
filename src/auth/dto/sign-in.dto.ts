import { IsString, MaxLength, MinLength } from 'class-validator';

/** A single form serves both roles. Role choice is deliberately server-side. */
export class SignInDto {
  @IsString()
  @MinLength(3)
  @MaxLength(255)
  username!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;
}
