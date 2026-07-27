import { IsOptional, IsString } from 'class-validator';

/** Reserved for a future read-only Tally synchronization trigger. */
export class TallySyncRequestDto {
  @IsOptional()
  @IsString()
  since?: string;
}
