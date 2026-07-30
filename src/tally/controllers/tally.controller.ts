import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Patch,
  Param,
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
import {
  CreateTallyMappingDto,
  TallyInvoiceQueryDto,
  TallyLedgerQueryDto,
  TallyPageQueryDto,
  TallyPaymentQueryDto,
  UpdateTallyMappingDto,
} from '../dto/tally-read-query.dto';
import { TallyConnectorAuthGuard } from '../guards/tally-connector-auth.guard';
import type { TallyConnectorRequest } from '../guards/tally-connector-auth.guard';
import { TallyConnectorService, TallySyncResult } from '../services/tally-connector.service';
import { TallyReadService } from '../services/tally-read.service';

@ApiTags('Tally')
@Controller({ path: 'tally', version: '1' })
export class TallyController {
  constructor(
    private readonly tallyService: TallyConnectorService,
    private readonly tallyReadService: TallyReadService,
  ) {}

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
  ) {
    return this.tallyReadService.dealerSummary(request.user.sub);
  }

  @Get('my-invoices')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.USER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List the signed-in dealer invoices imported from Tally' })
  getMyInvoices(
    @Req() request: { user: JwtPayload },
    @Query() query: TallyInvoiceQueryDto,
  ) {
    return this.tallyReadService.dealerInvoices(request.user.sub, query);
  }

  @Get('my-invoices/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.USER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get one signed-in dealer Tally invoice' })
  getMyInvoice(@Req() request: { user: JwtPayload }, @Param('id') id: string) {
    return this.tallyReadService.dealerInvoice(request.user.sub, id);
  }

  @Get('my-payments')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.USER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List the signed-in dealer payments imported from Tally' })
  getMyPayments(
    @Req() request: { user: JwtPayload },
    @Query() query: TallyPaymentQueryDto,
  ) {
    return this.tallyReadService.dealerPayments(request.user.sub, query);
  }

  @Get('my-payments/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.USER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get one signed-in dealer Tally payment' })
  getMyPayment(@Req() request: { user: JwtPayload }, @Param('id') id: string) {
    return this.tallyReadService.dealerPayment(request.user.sub, id);
  }

  @Get('my-statement')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.USER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get the signed-in dealer combined invoice and payment statement' })
  getMyStatement(
    @Req() request: { user: JwtPayload },
    @Query() query: TallyPageQueryDto,
  ) {
    return this.tallyReadService.dealerStatement(request.user.sub, query);
  }

  @Get('admin/dashboard')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get Tally synchronization dashboard metrics' })
  getAdminDashboard() {
    return this.tallyReadService.adminDashboard();
  }

  @Get('admin/ledgers')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List imported Tally ledgers and their mapping state' })
  getAdminLedgers(@Query() query: TallyLedgerQueryDto) {
    return this.tallyReadService.adminLedgers(query);
  }

  @Get('admin/ledgers/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get a Tally ledger' })
  getAdminLedger(@Param('id') id: string) {
    return this.tallyReadService.adminLedger(id);
  }

  @Get('admin/invoices')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List imported Tally invoices' })
  getAdminInvoices(@Query() query: TallyInvoiceQueryDto) {
    return this.tallyReadService.adminInvoices(query);
  }

  @Get('admin/payments')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List imported Tally payments' })
  getAdminPayments(@Query() query: TallyPaymentQueryDto) {
    return this.tallyReadService.adminPayments(query);
  }

  @Get('admin/unmatched-records')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Review Tally ledgers, invoices and payments with no dealer mapping' })
  getUnmatchedRecords(@Query() query: TallyPageQueryDto) {
    return this.tallyReadService.unmatchedRecords(query);
  }

  @Get('admin/sync-runs')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Review the most recent Tally agent sync runs' })
  getRecentRuns(@Query() query: TallyPageQueryDto) {
    return this.tallyReadService.findSyncRuns(query);
  }

  @Post('admin/mappings')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Manually map an imported Tally ledger to a dealer' })
  createMapping(@Body() dto: CreateTallyMappingDto) {
    return this.tallyReadService.createMapping(dto);
  }

  @Patch('admin/mappings/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update or deactivate a manual Tally ledger mapping' })
  updateMapping(@Param('id') id: string, @Body() dto: UpdateTallyMappingDto) {
    return this.tallyReadService.updateMapping(id, dto);
  }
}
