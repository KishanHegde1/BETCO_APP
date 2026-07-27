import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { UserRole } from '../common/constants/user-role.enum';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { StaffBillingQueueQueryDto } from './dto/staff-billing-queue-query.dto';
import {
  BillGenerationResponse,
  OrdersService,
  StaffBillingQueueOrder,
} from './orders.service';

/** Staff can only confirm that a bill already exists in Tally. */
@ApiBearerAuth()
@ApiTags('Staff Billing')
@Controller({ path: 'orders', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.STAFF)
export class StaffBillingController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get('billing-queue')
  @ApiOperation({
    summary:
      'List approved orders waiting for staff Tally billing confirmation',
  })
  findQueue(
    @Query() query: StaffBillingQueueQueryDto,
  ): Promise<StaffBillingQueueOrder[]> {
    return this.ordersService.findBillingQueue(query);
  }

  @Patch(':id/generate-bill')
  @ApiOperation({
    summary: 'Confirm that the order bill has been generated in Tally',
  })
  @ApiOkResponse({
    description: 'The order was marked BILLED and the dealer notified.',
  })
  generateBill(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: { user: JwtPayload },
  ): Promise<BillGenerationResponse> {
    return this.ordersService.generateBillForStaff(id, request.user.sub);
  }
}
