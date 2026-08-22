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
import { ImportPriceListDto, PreviewPriceListDto } from './dto/price-list.dto';
import {
  PriceListDetailResponse,
  PriceListPreviewResponse,
  PriceListResponse,
  PriceListsService,
} from './price-lists.service';

@ApiTags('Admin Price Lists')
@ApiBearerAuth()
@Controller({ path: 'admin/price-lists', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class PriceListsController {
  constructor(private readonly priceListsService: PriceListsService) {}

  @Get()
  @ApiOperation({ summary: 'List active and historical supplier Price Lists' })
  findAll(): Promise<PriceListResponse[]> {
    return this.priceListsService.findAll();
  }

  @Get('active')
  @ApiOperation({ summary: 'Get the current active Price List, if any' })
  findActive(): Promise<PriceListDetailResponse | null> {
    return this.priceListsService.findActive();
  }

  @Post('preview')
  @ApiOperation({
    summary: 'Preview exact model-name matches without creating a Price List',
  })
  @ApiOkResponse({
    description:
      'Shows matched, unmatched, changed, and unchanged prices before confirmation.',
  })
  preview(@Body() dto: PreviewPriceListDto): Promise<PriceListPreviewResponse> {
    return this.priceListsService.preview(dto);
  }

  @Post('import')
  @ApiOperation({
    summary: 'Save a historical Price List and optionally activate it',
  })
  @ApiCreatedResponse({
    description:
      'Unmatched rows are retained for review; no catalogue products are created.',
  })
  import(
    @Req() request: { user: JwtPayload },
    @Body() dto: ImportPriceListDto,
  ): Promise<PriceListDetailResponse> {
    return this.priceListsService.import(dto, request.user.sub);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get an imported Price List and its item matches' })
  findOne(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<PriceListDetailResponse> {
    return this.priceListsService.findOne(id);
  }

  @Post(':id/activate')
  @ApiOperation({
    summary:
      'Activate a historical Price List and deactivate the previous list',
  })
  activate(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<PriceListDetailResponse> {
    return this.priceListsService.activate(id);
  }
}
