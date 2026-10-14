import { IsString, IsNumber, IsOptional, IsEnum, validateSync, MinLength, IsBoolean } from 'class-validator';
import { plainToInstance, Type } from 'class-transformer';

export enum Environment {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

class EnvironmentVariables {
  @IsEnum(Environment)
  @IsOptional()
  NODE_ENV: Environment = Environment.Development;

  @Type(()=>Number)
  @IsNumber()
  @IsOptional()
  PORT: number = 3001;

  @IsString()
  DATABASE_URL: string;

  @IsString()
  @MinLength(32)
  JWT_SECRET:string;

  @IsString()
  S3_ENDPOINT: string;

  @IsString()
  S3_REGION: string;

  @IsString()
  S3_ACCESS_KEY: string;

  @IsString()
  S3_SECRET_KEY: string;

  @IsString()
  S3_BUCKET: string;

  @IsBoolean()
  @IsOptional()
  S3_FORCE_PATH_STYLE: boolean = true;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  MAX_DOCUMENT_SIZE: number = 5242880; // Default 5MB

  @IsString()
  @IsOptional()
  EMBEDDING_PROVIDER?: string = 'openai';

  @IsString()
  @IsOptional()
  EMBEDDING_MODEL?: string = 'text-embedding-3-small';

  @IsString()
  @IsOptional()
  EMBEDDING_API_KEY?: string;

  @IsString()
  @IsOptional()
  OPENAI_API_KEY?: string;

  @IsString()
  @IsOptional()
  EMBEDDING_API_URL?: string;

  @IsString()
  @IsOptional()
  REDIS_HOST?: string = 'localhost';

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  REDIS_PORT?: number = 6379;
}

export function validate(config: Record<string, unknown>) {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validatedConfig, { skipMissingProperties: false });

  if (errors.length > 0) {
    throw new Error(`Config validation error: ${errors.toString()}`);
  }
  return validatedConfig;
}
