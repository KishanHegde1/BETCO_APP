import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';

import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { UserRole } from '../common/constants/user-role.enum';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CreateOrderDto } from './dto/create-order.dto';
import {
  CreatedOrderResponse,
  DealerOrderDetailsResponse,
  OrderHistoryResponse,
  OrdersService,
} from './orders.service';

@ApiBearerAuth()
@ApiTags('Orders')
@Controller({ path: 'orders', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.USER)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get('my-orders')
  @ApiOperation({ summary: 'List the signed-in dealer’s previous orders' })
  findMyOrders(
    @Req() request: Request & { user: JwtPayload },
  ): Promise<OrderHistoryResponse[]> {
    return this.ordersService.findMyOrders(request.user.sub);
  }

  @Get('my-orders/:id')
  @ApiOperation({ summary: "Get one signed-in dealer's order" })
  findMyOrder(
    @Req() request: Request & { user: JwtPayload },
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<DealerOrderDetailsResponse> {
    return this.ordersService.findOneForDealer(request.user.sub, id);
  }

  @Post()
  @ApiOperation({ summary: "Book today's available stock" })
  createMyOrder(
    @Req() request: Request & { user: JwtPayload },
    @Body() createOrderDto: CreateOrderDto,
  ): Promise<CreatedOrderResponse> {
    return this.ordersService.createMyOrder(request.user.sub, createOrderDto);
  }
}
