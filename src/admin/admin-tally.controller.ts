import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { UserRole } from '../common/constants/user-role.enum';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import {
  TallyInvoiceQueryDto,
  TallyLedgerQueryDto,
  TallyTodayBillsQueryDto,
} from '../tally/dto/tally-read-query.dto';
import { TallyReadService } from '../tally/services/tally-read.service';

@ApiBearerAuth()
@ApiTags('Admin Tally')
@Controller({ path: 'admin/tally', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminTallyController {
  constructor(private readonly tallyReadService: TallyReadService) {}

  @Get('ledgers')
  @ApiOperation({ summary: 'Search imported Tally billing ledgers' })
  ledgers(@Query() query: TallyLedgerQueryDto) {
    return this.tallyReadService.adminLedgers(query);
  }

  @Get('bills/today')
  @ApiOperation({ summary: 'List bills generated in Tally for an India business date' })
  todayBills(@Query() query: TallyTodayBillsQueryDto) {
    return this.tallyReadService.adminTodayBills(query);
  }

  @Get('bills/:invoiceId')
  @ApiOperation({ summary: 'Get a Tally bill with imported line items' })
  invoice(@Param('invoiceId', new ParseUUIDPipe()) invoiceId: string) {
    return this.tallyReadService.adminInvoice(invoiceId);
  }

  @Get('invoices')
  @ApiOperation({ summary: 'List imported Tally invoices' })
  invoices(@Query() query: TallyInvoiceQueryDto) {
    return this.tallyReadService.adminInvoices(query);
  }
}
