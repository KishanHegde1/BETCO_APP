import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';

import { UserRole } from '../../common/constants/user-role.enum';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { TallySyncRequestDto } from '../dto/tally-sync-request.dto';
import { TallyConnectorAuthGuard } from '../guards/tally-connector-auth.guard';
import type { TallyConnectorRequest } from '../guards/tally-connector-auth.guard';
import {
  DealerLedgerSummary,
  TallyConnectorService,
  TallySyncResult,
} from '../services/tally-connector.service';

@ApiTags('Tally')
@Controller({ path: 'tally', version: '1' })
export class TallyController {
  constructor(private readonly tallyService: TallyConnectorService) {}

  @Post('sync')
  @HttpCode(HttpStatus.OK)
  @UseGuards(TallyConnectorAuthGuard)
  @ApiSecurity('tally-connector')
  @ApiOperation({
    summary: 'Accept read-only records exported by the registered Tally agent',
  })
  sync(
    @Req() request: TallyConnectorRequest,
    @Body() dto: TallySyncRequestDto,
  ): Promise<TallySyncResult> {
    // The header identity is authenticated independently of the payload.
    dto.connectorId = request.tallyConnectorId ?? dto.connectorId;
    return this.tallyService.sync(dto);
  }

  @Get('my-summary')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.USER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get the signed-in dealer Tally ledger summary' })
  getMySummary(
    @Req() request: { user: JwtPayload },
  ): Promise<DealerLedgerSummary> {
    return this.tallyService.getDealerSummary(request.user.sub);
  }

  @Get('admin/sync-runs')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Review the most recent Tally agent sync runs' })
  getRecentRuns(@Query('limit') limit?: string) {
    const parsed = Number.parseInt(limit ?? '50', 10);
    return this.tallyService.findRecentRuns(
      Number.isFinite(parsed) ? parsed : 50,
    );
  }
}
