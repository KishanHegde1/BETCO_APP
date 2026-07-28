import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';

/**
 * Opt-in connection identity logging for resolving Render/Neon mismatches.
 * It deliberately never logs a connection string, credentials, or any user data.
 */
@Injectable()
export class DatabaseDiagnosticsService implements OnApplicationBootstrap {
  private readonly logger = new Logger(DatabaseDiagnosticsService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!this.configService.get<boolean>('app.authDiagnostics')) {
      return;
    }

    const hostname = this.databaseHostname(
      this.configService.get<string>('database.url'),
    );
    try {
      const result: unknown = await this.dataSource.query(
        'SELECT current_database() AS database, current_schema() AS schema',
      );
      const row: unknown = Array.isArray(result) ? result[0] : undefined;
      this.logger.log(
        `AUTH_DATABASE_DIAGNOSTIC hostname=${hostname} database=${this.value(row, 'database')} schema=${this.value(row, 'schema')}`,
      );
    } catch {
      this.logger.warn(
        `AUTH_DATABASE_DIAGNOSTIC hostname=${hostname} database=unavailable schema=unavailable`,
      );
    }
  }

  private databaseHostname(databaseUrl: string | undefined): string {
    if (!databaseUrl) return 'unavailable';
    try {
      return new URL(databaseUrl).hostname || 'unavailable';
    } catch {
      return 'unavailable';
    }
  }

  private value(row: unknown, key: string): string {
    if (row === null || typeof row !== 'object' || !(key in row)) {
      return 'unavailable';
    }
    const value = (row as Record<string, unknown>)[key];
    return typeof value === 'string' ? value : 'unavailable';
  }
}
