import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiCreatedResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';

import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AuthService } from './auth.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { RegisterDealerDto } from './dto/register-dealer.dto';
import { SignInDto } from './dto/sign-in.dto';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { LoginResult } from './interfaces/login-result.interface';

@ApiTags('Authentication')
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register-dealer')
  @ApiOperation({
    summary: 'Register a new dealer account',
    description:
      'Creates an active dealer account only. This endpoint cannot create staff or administrator accounts.',
  })
  @ApiCreatedResponse({
    description: 'Dealer account registered and signed in.',
  })
  registerDealer(@Body() dto: RegisterDealerDto): Promise<LoginResult> {
    return this.authService.registerDealer(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign in with username and password' })
  signIn(@Body() signInDto: SignInDto): Promise<LoginResult> {
    return this.authService.signIn(signInDto);
  }

  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Replace the initial password with a personal password',
  })
  async changePassword(
    @Req() request: Request & { user: JwtPayload },
    @Body() changePasswordDto: ChangePasswordDto,
  ): Promise<void> {
    await this.authService.changePassword(request.user.sub, changePasswordDto);
  }
}
