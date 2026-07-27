import { Injectable } from '@nestjs/common';

@Injectable()
export class HealthService {
  getStatus(): { status: string; service: string } {
    return { status: 'ok', service: 'betco-traders-backend' };
  }
}
