import {
  Controller,
  Get,
  Param,
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
import { AdminDealersService } from './admin-dealers.service';
import { AdminDealerOrdersQueryDto } from './dto/admin-dealer-orders-query.dto';
import { AdminDealersQueryDto } from './dto/admin-dealers-query.dto';

@ApiBearerAuth()
@ApiTags('Admin Dealers')
@Controller({ path: 'admin/dealers', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminDealersController {
  constructor(private readonly dealersService: AdminDealersService) {}

  @Get()
  @ApiOperation({ summary: 'List registered dealers for administrators' })
  @ApiOkResponse({ description: 'Paginated registered dealer records.' })
  findAll(@Query() query: AdminDealersQueryDto) {
    return this.dealersService.findAll(query);
  }

  @Get(':dealerId')
  @ApiOperation({ summary: 'Get a dealer profile and all-time order summary' })
  findOne(@Param('dealerId', new ParseUUIDPipe()) dealerId: string) {
    return this.dealersService.findOne(dealerId);
  }

  @Get(':dealerId/orders')
  @ApiOperation({ summary: 'List a dealer order history with period filters' })
  findOrders(
    @Param('dealerId', new ParseUUIDPipe()) dealerId: string,
    @Query() query: AdminDealerOrdersQueryDto,
  ) {
    return this.dealersService.findOrders(dealerId, query);
  }

  @Get(':dealerId/analytics')
  @ApiOperation({
    summary: 'Get real order analytics for one dealer and period',
  })
  findAnalytics(
    @Param('dealerId', new ParseUUIDPipe()) dealerId: string,
    @Query() query: AdminDealerOrdersQueryDto,
  ) {
    return this.dealersService.findAnalytics(dealerId, query);
  }
}
