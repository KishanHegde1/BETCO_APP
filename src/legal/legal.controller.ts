import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Post,
  Res,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { ApiExcludeEndpoint, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';

import { Public } from '../common/decorators/public.decorator';
import { CreateAccountDeletionRequestDto } from './dto/create-account-deletion-request.dto';
import {
  accountDeletionConfirmationPage,
  accountDeletionPage,
  privacyPolicyPage,
  termsAndConditionsPage,
} from './legal.pages';
import { LegalService } from './legal.service';

@ApiTags('Legal')
@Controller({ path: '', version: VERSION_NEUTRAL })
export class LegalController {
  constructor(private readonly legalService: LegalService) {}

  @Public()
  @Get('privacy-policy')
  @ApiExcludeEndpoint()
  privacyPolicy(@Res() response: Response): void {
    response.type('html').send(privacyPolicyPage());
  }

  @Public()
  @Get('terms-and-conditions')
  @ApiExcludeEndpoint()
  termsAndConditions(@Res() response: Response): void {
    response.type('html').send(termsAndConditionsPage());
  }

  @Public()
  @Get('account-deletion')
  @ApiExcludeEndpoint()
  accountDeletionForm(@Res() response: Response): void {
    response.type('html').send(accountDeletionPage());
  }

  @Public()
  @Post('account-deletion')
  @ApiExcludeEndpoint()
  async submitAccountDeletion(
    @Body() dto: CreateAccountDeletionRequestDto,
    @Res() response: Response,
  ): Promise<void> {
    const request = await this.legalService.createDeletionRequest(dto);
    response
      .status(HttpStatus.CREATED)
      .type('html')
      .send(accountDeletionConfirmationPage(request.id));
  }
}
