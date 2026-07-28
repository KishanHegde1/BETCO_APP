import { IsString, MaxLength, MinLength } from 'class-validator';

export class ResetAdminDealerPasswordDto {
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  confirmPassword!: string;
}
