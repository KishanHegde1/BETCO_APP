import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { UserRole } from '../common/constants/user-role.enum';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { TallyPaymentQueryDto } from '../tally/dto/tally-read-query.dto';
import { PaymentsService } from './payments.service';

@ApiTags('Payments')
@Controller({ path: 'payments', version: '1' })
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.USER)
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get('my-summary')
  @ApiOperation({ summary: 'Get the signed-in dealer accounting summary' })
  summary(@Req() request: { user: JwtPayload }) {
    return this.paymentsService.mySummary(request.user.sub);
  }

  @Get('my-transactions')
  @ApiOperation({
    summary: "List the signed-in dealer's Tally-synchronized payments",
  })
  transactions(
    @Req() request: { user: JwtPayload },
    @Query() query: TallyPaymentQueryDto,
  ) {
    return this.paymentsService.myTransactions(request.user.sub, query);
  }

  @Get('my-transactions/:id')
  transaction(@Req() request: { user: JwtPayload }, @Param('id') id: string) {
    return this.paymentsService.myTransaction(request.user.sub, id);
  }
}
