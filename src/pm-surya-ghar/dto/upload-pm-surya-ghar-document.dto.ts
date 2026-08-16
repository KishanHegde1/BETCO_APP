import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

import { PmSuryaGharDocumentType } from '../../entities/pm-surya-ghar-document.entity';

export class UploadPmSuryaGharDocumentDto {
  @IsEnum(PmSuryaGharDocumentType)
  documentType!: PmSuryaGharDocumentType;

  @IsString()
  @MinLength(2)
  @MaxLength(255)
  title!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(30)
  pageCount!: number;
}
