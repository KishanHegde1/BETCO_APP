import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { UserRole } from '../common/constants/user-role.enum';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AdminOrdersQueryDto } from './dto/admin-orders-query.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import {
  AdminOrderDetailsResponse,
  PaginatedAdminOrdersResponse,
  OrdersService,
} from './orders.service';

@ApiBearerAuth()
@ApiTags('Admin Orders')
@Controller({ path: 'admin/orders', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminOrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  @ApiOperation({ summary: 'List dealer orders for administrators' })
  @ApiOkResponse({ description: 'Paginated dealer order summaries.' })
  findAll(
    @Query() query: AdminOrdersQueryDto,
  ): Promise<PaginatedAdminOrdersResponse> {
    return this.ordersService.findAllForAdmin(query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get an order and dealer details for administrators',
  })
  @ApiOkResponse({
    description: 'The selected order, dealer summary, and items.',
  })
  findOne(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<AdminOrderDetailsResponse> {
    return this.ordersService.findOneForAdmin(id);
  }

  @Patch(':id/status')
  @ApiOperation({
    summary: 'Approve, partially fulfil, reject, cancel, or complete an order',
  })
  @ApiOkResponse({
    description:
      'The order after its requested administrator status transition.',
  })
  updateStatus(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() updateOrderStatusDto: UpdateOrderStatusDto,
  ): Promise<AdminOrderDetailsResponse> {
    return this.ordersService.updateStatusForAdmin(id, updateOrderStatusDto);
  }
}
