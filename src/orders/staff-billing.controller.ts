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
@Controller({ path: 'staff/orders', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
export class StaffBillingController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get('billing-queue')
  @Roles(UserRole.STAFF)
  @ApiOperation({
    summary:
      'List approved orders waiting for staff Tally billing confirmation',
  })
  findQueue(
    @Query() query: StaffBillingQueueQueryDto,
  ): Promise<StaffBillingQueueOrder[]> {
    return this.ordersService.findBillingQueue(query);
  }

  @Get('billed')
  @Roles(UserRole.STAFF)
  @ApiOperation({ summary: 'List orders already marked billed in Tally' })
  findBilled(
    @Query() query: StaffBillingQueueQueryDto,
  ): Promise<StaffBillingQueueOrder[]> {
    return this.ordersService.findBilledOrdersForStaff(query);
  }

  @Patch(':orderId/mark-billed')
  @Roles(UserRole.STAFF)
  @ApiOperation({
    summary: 'Confirm that the order bill has been generated in Tally',
  })
  @ApiOkResponse({
    description: 'The order was marked BILLED and the dealer notified.',
  })
  generateBill(
    @Param('orderId', new ParseUUIDPipe()) id: string,
    @Req() request: { user: JwtPayload },
  ): Promise<BillGenerationResponse> {
    return this.ordersService.generateBillForStaff(id, request.user.sub);
  }
}
