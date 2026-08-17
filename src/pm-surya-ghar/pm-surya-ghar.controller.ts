import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { UserRole } from '../common/constants/user-role.enum';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PmSuryaGharDocumentType } from '../entities/pm-surya-ghar-document.entity';
import { CreatePmSuryaGharApplicationDto } from './dto/create-pm-surya-ghar-application.dto';
import { CreatePmSuryaGharItemDto } from './dto/create-pm-surya-ghar-item.dto';
import { UpdatePmSuryaGharApplicationDto } from './dto/update-pm-surya-ghar-application.dto';
import { UpdatePmSuryaGharItemDto } from './dto/update-pm-surya-ghar-item.dto';
import { UploadPmSuryaGharDocumentDto } from './dto/upload-pm-surya-ghar-document.dto';
import {
  PmSuryaGharService,
  UploadedPmSuryaGharPdf,
} from './pm-surya-ghar.service';

const MAX_PDF_BYTES = 20 * 1024 * 1024;

const pdfUploadInterceptor = FileInterceptor('pdf', {
  limits: { files: 1, fileSize: MAX_PDF_BYTES },
  fileFilter: (_, file, callback) => {
    if (file.mimetype === 'application/pdf') {
      callback(null, true);
      return;
    }
    callback(
      new BadRequestException('The selected file must be a PDF.'),
      false,
    );
  },
});

@ApiBearerAuth()
@ApiTags('PM Surya Ghar')
@Controller({ path: 'pm-surya-ghar/applications', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.STAFF)
export class PmSuryaGharController {
  constructor(private readonly pmSuryaGharService: PmSuryaGharService) {}

  @Post()
  @ApiOperation({
    summary: 'Create a PM Surya Ghar customer application draft',
  })
  create(
    @Req() request: { user: JwtPayload },
    @Body() dto: CreatePmSuryaGharApplicationDto,
  ) {
    return this.pmSuryaGharService.create(request.user, dto);
  }

  @Get()
  @ApiOperation({
    summary:
      'List owned and staff-visible PM Surya Ghar applications, or all for an administrator',
  })
  findAll(@Req() request: { user: JwtPayload }) {
    return this.pmSuryaGharService.findAll(request.user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one accessible PM Surya Ghar application' })
  findOne(
    @Req() request: { user: JwtPayload },
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.pmSuryaGharService.findOne(id, request.user);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a manageable PM Surya Ghar draft' })
  update(
    @Req() request: { user: JwtPayload },
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdatePmSuryaGharApplicationDto,
  ) {
    return this.pmSuryaGharService.update(id, request.user, dto);
  }

  @Post(':id/items')
  @ApiOperation({ summary: 'Add an item to a manageable application draft' })
  createItem(
    @Req() request: { user: JwtPayload },
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CreatePmSuryaGharItemDto,
  ) {
    return this.pmSuryaGharService.createItem(id, request.user, dto);
  }

  @Patch(':id/items/:itemId')
  @ApiOperation({
    summary: 'Update an item in a manageable application draft',
  })
  updateItem(
    @Req() request: { user: JwtPayload },
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('itemId', new ParseUUIDPipe()) itemId: string,
    @Body() dto: UpdatePmSuryaGharItemDto,
  ) {
    return this.pmSuryaGharService.updateItem(id, itemId, request.user, dto);
  }

  @Delete(':id/items/:itemId')
  @ApiOperation({
    summary: 'Remove an item from a manageable application draft',
  })
  removeItem(
    @Req() request: { user: JwtPayload },
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('itemId', new ParseUUIDPipe()) itemId: string,
  ) {
    return this.pmSuryaGharService.removeItem(id, itemId, request.user);
  }

  @Post(':id/documents')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseInterceptors(pdfUploadInterceptor)
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['documentType', 'title', 'pageCount', 'pdf'],
      properties: {
        documentType: {
          type: 'string',
          enum: Object.values(PmSuryaGharDocumentType),
        },
        title: { type: 'string', minLength: 2, maxLength: 255 },
        pageCount: { type: 'integer', minimum: 1, maximum: 30 },
        pdf: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiOperation({
    summary: 'Upload one validated PDF to private PM Surya Ghar storage',
  })
  uploadDocument(
    @Req() request: { user: JwtPayload },
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UploadPmSuryaGharDocumentDto,
    @UploadedFile() pdf: UploadedPmSuryaGharPdf | undefined,
  ) {
    return this.pmSuryaGharService.uploadDocument(id, request.user, dto, pdf);
  }

  @Get(':id/documents/:documentId/download')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Create a short-lived signed PDF download URL' })
  createDownloadUrl(
    @Req() request: { user: JwtPayload },
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('documentId', new ParseUUIDPipe()) documentId: string,
  ) {
    return this.pmSuryaGharService.createDownloadUrl(
      id,
      documentId,
      request.user,
    );
  }

  @Post(':id/submit')
  @ApiOperation({
    summary: 'Mark a complete draft ready for internal review',
  })
  submit(
    @Req() request: { user: JwtPayload },
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.pmSuryaGharService.submit(id, request.user);
  }
}
