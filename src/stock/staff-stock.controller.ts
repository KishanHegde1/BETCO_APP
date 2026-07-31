import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { UserRole } from '../common/constants/user-role.enum';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AddStaffStockDto } from './dto/add-staff-stock.dto';
import { StaffStockAddResponse, StockService } from './stock.service';

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
}
