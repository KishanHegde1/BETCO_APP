import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
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
import { AdminOrdersQueryDto } from './dto/admin-orders-query.dto';
import { CreateStaffOrderDto } from './dto/create-staff-order.dto';
import { StaffDealerQueryDto } from './dto/staff-dealer-query.dto';
import {
  BillGenerationResponse,
  CreatedOrderResponse,
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

  @Get('dealers')
  @Roles(UserRole.STAFF)
  @ApiOperation({ summary: 'List active dealers for staff order entry' })
  findDealers(@Query() query: StaffDealerQueryDto) {
    return this.ordersService.findDealersForStaffOrder(query.search);
  }

  @Post()
  @Roles(UserRole.STAFF)
  @ApiOperation({
    summary: 'Record a dealer phone or notebook order for admin approval',
  })
  create(
    @Req() request: { user: JwtPayload },
    @Body() dto: CreateStaffOrderDto,
  ): Promise<CreatedOrderResponse> {
    return this.ordersService.createForStaff(request.user.sub, dto);
  }

  @Get('recorded')
  @Roles(UserRole.STAFF)
  @ApiOperation({ summary: 'List all orders recorded for staff operations' })
  findRecorded(@Query() query: AdminOrdersQueryDto) {
    return this.ordersService.findAllForStaff(query);
  }

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

  @Get(':orderId')
  @Roles(UserRole.STAFF, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Get complete order details for staff dispatch work',
  })
  findOne(@Param('orderId', new ParseUUIDPipe()) id: string) {
    return this.ordersService.findOneForStaff(id);
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

  @Patch(':orderId/mark-shipped')
  @Roles(UserRole.STAFF)
  @ApiOperation({ summary: 'Mark an eligible billed order as shipped' })
  markShipped(
    @Param('orderId', new ParseUUIDPipe()) id: string,
    @Req() request: { user: JwtPayload },
  ) {
    return this.ordersService.markShipped(id, request.user.sub);
  }
}
