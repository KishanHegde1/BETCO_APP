import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class HealthService {
  constructor(private readonly dataSource: DataSource) {}

  /** A real query makes this endpoint confirm both Render and Neon are live. */
  async getStatus(): Promise<{
    status: string;
    service: string;
    database: string;
  }> {
    await this.dataSource.query('SELECT 1');
    return {
      status: 'ok',
      service: 'betco-traders-backend',
      database: 'connected',
    };
  }
}
