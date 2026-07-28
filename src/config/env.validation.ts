import { plainToInstance } from 'class-transformer';
import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsPort,
  IsString,
  ValidateIf,
  validateSync,
} from 'class-validator';

class EnvironmentVariables {
  @IsOptional()
  @IsPort()
  PORT?: string;

  @ValidateIf(
    (environment: EnvironmentVariables) => environment.NODE_ENV !== 'test',
  )
  @IsString()
  @IsNotEmpty()
  DATABASE_URL?: string;

  @IsOptional()
  @IsIn(['true', 'false'])
  DATABASE_SSL?: string;

  @ValidateIf(
    (environment: EnvironmentVariables) => environment.NODE_ENV !== 'test',
  )
  @IsString()
  @IsNotEmpty()
  JWT_SECRET?: string;

  @IsOptional()
  @IsString()
  JWT_EXPIRES_IN?: string;

  /** @deprecated Use JWT_EXPIRES_IN. Kept for deployed environments. */
  @IsOptional()
  @IsString()
  JWT_EXPIRES?: string;

  @IsOptional()
  @IsString()
  CORS_ORIGIN?: string;

  @IsOptional()
  @IsIn(['development', 'test', 'production'])
  NODE_ENV?: string;

  @IsOptional()
  @IsIn(['true', 'false'])
  SWAGGER_ENABLED?: string;

  @IsOptional()
  @IsString()
  TALLY_CONNECTOR_SECRET?: string;

  @IsOptional()
  @IsString()
  TALLY_CONNECTOR_ID?: string;

  @IsOptional()
  @IsString()
  CLOUDINARY_CLOUD_NAME?: string;

  @IsOptional()
  @IsString()
  CLOUDINARY_API_KEY?: string;

  @IsOptional()
  @IsString()
  CLOUDINARY_API_SECRET?: string;

  @IsOptional()
  @IsString()
  CLOUDINARY_SOLAR_PROJECTS_FOLDER?: string;
}

export function validateEnvironment(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    throw new Error(`Environment validation failed: ${errors.toString()}`);
  }

  if (
    validatedConfig.NODE_ENV === 'production' &&
    validatedConfig.CORS_ORIGIN?.trim() === '*'
  ) {
    throw new Error(
      'CORS_ORIGIN must be an explicit HTTPS origin in production, not "*".',
    );
  }

  return config;
}
