import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

import { SolarProjectStatus } from '../../entities/solar-project.entity';

export class CreateSolarProjectDto {
  @IsString()
  @MinLength(3)
  @MaxLength(255)
  title!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  description!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  customerName?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(255)
  location!: string;

  @IsDateString()
  completionDate!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  category!: string;

  @IsOptional()
  @IsEnum(SolarProjectStatus)
  status?: SolarProjectStatus;
}
