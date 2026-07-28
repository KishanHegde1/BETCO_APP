import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

import { SolarProjectStatus } from '../../entities/solar-project.entity';

export class UpdateSolarProjectDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(255)
  title?: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  customerName?: string | null;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  location?: string;

  @IsOptional()
  @IsDateString()
  completionDate?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  removedMediaIds?: string;

  @IsOptional()
  @IsEnum(SolarProjectStatus)
  status?: SolarProjectStatus;
}
