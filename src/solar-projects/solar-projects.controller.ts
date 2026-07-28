import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Request } from 'express';

import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { UserRole } from '../common/constants/user-role.enum';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CreateSolarProjectDto } from './dto/create-solar-project.dto';
import { SolarProjectQueryDto } from './dto/solar-project-query.dto';
import { UpdateSolarProjectDto } from './dto/update-solar-project.dto';
import {
  SolarProjectsService,
  UploadedSolarProjectFile,
} from './solar-projects.service';

const uploadInterceptor = FilesInterceptor('media', 20, {
  limits: { files: 20, fileSize: 200 * 1024 * 1024 },
});

@ApiBearerAuth()
@ApiTags('Solar Projects')
@Controller({ path: 'solar-projects', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.USER, UserRole.STAFF)
export class SolarProjectsController {
  constructor(private readonly solarProjectsService: SolarProjectsService) {}

  @Get()
  @ApiOperation({ summary: 'Browse published solar projects' })
  findAll(
    @Query() query: SolarProjectQueryDto,
    @Req() request: Request & { user: JwtPayload },
  ) {
    return this.solarProjectsService.findAll(query, request.user);
  }

  @Get('filters')
  @ApiOperation({ summary: 'List Solar Projects gallery filter values' })
  findFilters(@Req() request: Request & { user: JwtPayload }) {
    return this.solarProjectsService.findFilters(request.user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one solar project and its Cloudinary media' })
  findOne(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: Request & { user: JwtPayload },
  ) {
    return this.solarProjectsService.findOne(id, request.user);
  }
}

@ApiBearerAuth()
@ApiTags('Admin Solar Projects')
@Controller({ path: 'admin/solar-projects', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminSolarProjectsController {
  constructor(private readonly solarProjectsService: SolarProjectsService) {}

  @Post()
  @UseInterceptors(uploadInterceptor)
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: [
        'title',
        'description',
        'location',
        'completionDate',
        'category',
        'media',
      ],
      properties: {
        title: { type: 'string' },
        description: { type: 'string' },
        customerName: { type: 'string', nullable: true },
        location: { type: 'string' },
        completionDate: { type: 'string', format: 'date' },
        category: { type: 'string' },
        status: { type: 'string', enum: ['DRAFT', 'PUBLISHED'] },
        media: { type: 'array', items: { type: 'string', format: 'binary' } },
      },
    },
  })
  @ApiOperation({
    summary: 'Create a solar project and stream media to Cloudinary',
  })
  create(
    @Body() dto: CreateSolarProjectDto,
    @UploadedFiles() files: UploadedSolarProjectFile[] | undefined,
    @Req() request: Request & { user: JwtPayload },
  ) {
    return this.solarProjectsService.create(dto, request.user.sub, files);
  }

  @Patch(':id')
  @UseInterceptors(uploadInterceptor)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Update Solar Project details or replace Cloudinary media',
  })
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateSolarProjectDto,
    @UploadedFiles() files: UploadedSolarProjectFile[] | undefined,
  ) {
    return this.solarProjectsService.update(id, dto, files);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a solar project and its Cloudinary media' })
  remove(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.solarProjectsService.remove(id);
  }
}
