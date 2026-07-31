import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { UserRole } from '../common/constants/user-role.enum';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { TallyInvoiceQueryDto } from '../tally/dto/tally-read-query.dto';
import { BillingService } from './billing.service';

@ApiTags('Billing')
@Controller({ path: 'billing', version: '1' })
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.USER)
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Get('my-invoices')
  @ApiOperation({
    summary: "List only the signed-in dealer's synchronized Tally invoices",
  })
  list(
    @Req() request: { user: JwtPayload },
    @Query() query: TallyInvoiceQueryDto,
  ) {
    return this.billingService.myInvoices(request.user.sub, query);
  }

  @Get('my-invoices/:invoiceId')
  getOne(@Req() request: { user: JwtPayload }, @Param('invoiceId') id: string) {
    return this.billingService.myInvoice(request.user.sub, id);
  }

  @Get('my-invoices/:invoiceId/pdf')
  getPdf(@Req() request: { user: JwtPayload }, @Param('invoiceId') id: string) {
    return this.billingService.myInvoicePdf(request.user.sub, id);
  }
}
