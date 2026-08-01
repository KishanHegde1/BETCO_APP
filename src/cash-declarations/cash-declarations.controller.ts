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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { UserRole } from '../common/constants/user-role.enum';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CashDeclarationQueryDto } from './dto/cash-declaration-query.dto';
import { CreateCashDeclarationDto } from './dto/create-cash-declaration.dto';
import { CashDeclarationsService } from './cash-declarations.service';

@ApiBearerAuth()
@ApiTags('Cash acknowledgements')
@Controller({ path: 'cash-declarations', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
export class CashDeclarationsController {
  constructor(private readonly cashDeclarationsService: CashDeclarationsService) {}

  @Post()
  @Roles(UserRole.USER)
  @ApiOperation({
    summary: 'Record cash given to Betco without creating a Tally entry',
  })
  create(
    @Req() request: { user: JwtPayload },
    @Body() dto: CreateCashDeclarationDto,
  ) {
    return this.cashDeclarationsService.createForDealer(request.user.sub, dto);
  }

  @Get('my')
  @Roles(UserRole.USER)
  @ApiOperation({ summary: 'List the signed-in dealer cash acknowledgements' })
  mine(@Req() request: { user: JwtPayload }) {
    return this.cashDeclarationsService.findMine(request.user.sub);
  }
}

@ApiBearerAuth()
@ApiTags('Admin cash acknowledgements')
@Controller({ path: 'admin/cash-declarations', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminCashDeclarationsController {
  constructor(private readonly cashDeclarationsService: CashDeclarationsService) {}

  @Get()
  @ApiOperation({ summary: 'View internal dealer cash acknowledgements' })
  findAll(@Query() query: CashDeclarationQueryDto) {
    return this.cashDeclarationsService.findForOperations(query);
  }

  @Patch(':id/mark-received')
  @ApiOperation({
    summary: 'Confirm cash was received without changing Tally accounting',
  })
  markReceived(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: { user: JwtPayload },
  ) {
    return this.cashDeclarationsService.markReceived(id, request.user.sub);
  }
}

@ApiBearerAuth()
@ApiTags('Staff cash acknowledgements')
@Controller({ path: 'staff/cash-declarations', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.STAFF)
export class StaffCashDeclarationsController {
  constructor(private readonly cashDeclarationsService: CashDeclarationsService) {}

  @Get()
  @ApiOperation({ summary: 'View internal dealer cash acknowledgements' })
  findAll(@Query() query: CashDeclarationQueryDto) {
    return this.cashDeclarationsService.findForOperations(query);
  }

  @Patch(':id/mark-received')
  @ApiOperation({
    summary: 'Confirm cash was received without changing Tally accounting',
  })
  markReceived(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: { user: JwtPayload },
  ) {
    return this.cashDeclarationsService.markReceived(id, request.user.sub);
  }
}
