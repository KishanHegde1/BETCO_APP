import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

const trimText = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/** Public, minimal form used for Play Store account-deletion requests. */
export class CreateAccountDeletionRequestDto {
  @Transform(trimText)
  @IsString()
  @MinLength(3)
  @MaxLength(255)
  accountIdentifier!: string;

  @Transform(trimText)
  @IsString()
  @MinLength(7)
  @MaxLength(255)
  contact!: string;

  @Transform(trimText)
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  details?: string;
}
