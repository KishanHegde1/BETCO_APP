import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';

const CONNECTOR_ID_HEADER = 'x-betco-connector-id';
const SYNC_KEY_HEADER = 'x-betco-sync-key';

export interface TallyConnectorRequest {
  headers: Record<string, string | string[] | undefined>;
  tallyConnectorId?: string;
}

@Injectable()
export class TallyConnectorAuthGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<TallyConnectorRequest>();
    const configuredId = this.configService
      .get<string>('tally.connectorId')
      ?.trim();
    const configuredSecret = this.configService
      .get<string>('tally.connectorSecret')
      ?.trim();
    if (!configuredId || !configuredSecret) {
      throw new ServiceUnavailableException(
        'Tally connector authentication is not configured.',
      );
    }

    const connectorId = this.header(request, CONNECTOR_ID_HEADER);
    const secret = this.header(request, SYNC_KEY_HEADER);
    if (
      !connectorId ||
      !secret ||
      !this.equal(connectorId, configuredId) ||
      !this.equal(secret, configuredSecret)
    ) {
      throw new UnauthorizedException('Invalid Tally connector credentials.');
    }
    request.tallyConnectorId = connectorId;
    return true;
  }

  private header(request: TallyConnectorRequest, name: string): string {
    const value = request.headers[name];
    return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
  }

  private equal(left: string, right: string): boolean {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);
    return (
      leftBuffer.length === rightBuffer.length &&
      timingSafeEqual(leftBuffer, rightBuffer)
    );
  }
}
