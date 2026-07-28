import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService): TypeOrmModuleOptions => {
        const url = configService.get<string>('database.url');

        if (!url) {
          throw new Error(
            'DATABASE_URL must be configured before starting the API.',
          );
        }

        const ssl = configService.get<boolean>('database.ssl') ?? false;
        return {
          type: 'postgres',
          url,
          autoLoadEntities: true,
          synchronize: false,
          retryAttempts: 5,
          retryDelay: 3000,
          ssl: ssl ? { rejectUnauthorized: false } : false,
          extra: { max: configService.get<number>('database.poolMax') ?? 10 },
        };
      },
    }),
  ],
})
export class DatabaseModule {}
