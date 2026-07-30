import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Get,
  Param,
  Patch,
  Put,
  Delete,
  ParseUUIDPipe,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
  UseGuards,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { UserRole } from '../common/constants/user-role.enum';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AdminDealersService } from './admin-dealers.service';
import type { UploadedDealerSpreadsheet } from './admin-dealers.service';
import { AdminDealerOrdersQueryDto } from './dto/admin-dealer-orders-query.dto';
import { AdminDealersQueryDto } from './dto/admin-dealers-query.dto';
import { CreateAdminDealerDto } from './dto/create-admin-dealer.dto';
import { ResetAdminDealerPasswordDto } from './dto/reset-admin-dealer-password.dto';
import { UpdateAdminDealerDto } from './dto/update-admin-dealer.dto';
import { UpdateAdminDealerStatusDto } from './dto/update-admin-dealer-status.dto';
import { UpdateDealerTallyMappingDto } from './dto/update-dealer-tally-mapping.dto';

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

  @Post()
  @ApiOperation({ summary: 'Manually create a dealer account' })
  @ApiCreatedResponse({ description: 'Dealer account created.' })
  create(@Body() dto: CreateAdminDealerDto) {
    return this.dealersService.create(dto);
  }

  @Put(':dealerId/tally-mapping')
  @ApiOperation({ summary: 'Map a dealer to the exact Tally billing ledger name' })
  updateTallyMapping(
    @Param('dealerId', new ParseUUIDPipe()) dealerId: string,
    @Body() dto: UpdateDealerTallyMappingDto,
  ) {
    return this.dealersService.updateTallyMapping(dealerId, dto);
  }

  @Delete(':dealerId/tally-mapping')
  @ApiOperation({ summary: 'Safely deactivate a dealer Tally ledger mapping' })
  removeTallyMapping(
    @Param('dealerId', new ParseUUIDPipe()) dealerId: string,
  ) {
    return this.dealersService.removeTallyMapping(dealerId);
  }

  @Post('import/validate')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 5 * 1024 * 1024, files: 1 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Validate a dealer .xlsx file without importing it',
  })
  validateImport(@UploadedFile() file?: unknown) {
    return this.dealersService.validateImport(
      file as UploadedDealerSpreadsheet,
    );
  }

  @Post('import')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 5 * 1024 * 1024, files: 1 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Import validated dealer accounts from a .xlsx file',
  })
  importSpreadsheet(@UploadedFile() file?: unknown) {
    return this.dealersService.import(file as UploadedDealerSpreadsheet);
  }

  @Get(':dealerId')
  @ApiOperation({ summary: 'Get a dealer profile and all-time order summary' })
  findOne(@Param('dealerId', new ParseUUIDPipe()) dealerId: string) {
    return this.dealersService.findOne(dealerId);
  }

  @Patch(':dealerId')
  @ApiOperation({ summary: 'Edit dealer account and profile information' })
  update(
    @Param('dealerId', new ParseUUIDPipe()) dealerId: string,
    @Body() dto: UpdateAdminDealerDto,
  ) {
    return this.dealersService.update(dealerId, dto);
  }

  @Patch(':dealerId/status')
  @ApiOperation({ summary: 'Activate or deactivate a dealer account' })
  updateStatus(
    @Param('dealerId', new ParseUUIDPipe()) dealerId: string,
    @Body() dto: UpdateAdminDealerStatusDto,
  ) {
    return this.dealersService.updateStatus(dealerId, dto);
  }

  @Post(':dealerId/reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reset a dealer password and require a change at sign-in',
  })
  resetPassword(
    @Param('dealerId', new ParseUUIDPipe()) dealerId: string,
    @Body() dto: ResetAdminDealerPasswordDto,
  ) {
    return this.dealersService.resetPassword(dealerId, dto);
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
