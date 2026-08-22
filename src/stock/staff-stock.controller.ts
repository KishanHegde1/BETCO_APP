import {
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { UserRole } from '../common/constants/user-role.enum';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AddStaffStockDto } from './dto/add-staff-stock.dto';
import { ReduceStaffStockDto } from './dto/reduce-staff-stock.dto';
import { UpdateStockUnitPriceDto } from './dto/update-stock-unit-price.dto';
import {
  StaffStockAddResponse,
  StaffStockReductionResponse,
  StaffStockUnitPriceResponse,
  StockService,
} from './stock.service';

@ApiTags('Staff Stock')
@ApiBearerAuth()
@Controller({ path: 'staff/daily-stock', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.STAFF, UserRole.ADMIN)
export class StaffStockController {
  constructor(private readonly stockService: StockService) {}

  @Post('add')
  @ApiOperation({
    summary: 'Add a positive quantity to the current stock balance',
  })
  @ApiCreatedResponse({
    description: 'The increment and immutable audit record were saved.',
  })
  add(
    @Req() request: { user: JwtPayload },
    @Body() dto: AddStaffStockDto,
  ): Promise<StaffStockAddResponse> {
    return this.stockService.addStockForStaff(request.user.sub, dto);
  }

  @Post('reduce')
  @ApiOperation({
    summary:
      'Reduce the current stock balance without allowing a negative value',
  })
  @ApiCreatedResponse({
    description: 'The reduction and immutable audit record were saved.',
  })
  reduce(
    @Req() request: { user: JwtPayload },
    @Body() dto: ReduceStaffStockDto,
  ): Promise<StaffStockReductionResponse> {
    return this.stockService.reduceStockForStaff(request.user.sub, dto);
  }

  @Patch(':productId/unit-price')
  @ApiOperation({
    summary: 'Set the internal stock unit price for an active product',
  })
  @ApiOkResponse({
    description: 'The internal stock reference price was updated.',
  })
  updateUnitPrice(
    @Param('productId', new ParseUUIDPipe()) productId: string,
    @Body() dto: UpdateStockUnitPriceDto,
  ): Promise<StaffStockUnitPriceResponse> {
    return this.stockService.updateUnitPriceForStaff(productId, dto);
  }
}
