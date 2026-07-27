import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Request } from 'express';

import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ProfileResponse, ProfileService } from './profile.service';

@ApiTags('Profile')
@ApiBearerAuth()
@Controller({ path: 'profile', version: '1' })
@UseGuards(JwtAuthGuard)
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Get()
  @ApiOperation({ summary: 'Get the signed-in user profile' })
  @ApiOkResponse({
    schema: {
      example: {
        success: true,
        data: {
          id: 'uuid',
          username: 'dealer_username',
          role: 'USER',
          shopName: 'ABC Electricals',
          contactNumber: '+91 9876543210',
          address: 'Complete shop address',
        },
      },
    },
  })
  getProfile(
    @Req() request: Request & { user: JwtPayload },
  ): Promise<ProfileResponse> {
    return this.profileService.getProfile(request.user.sub);
  }

  @Patch()
  @ApiOperation({ summary: 'Update the signed-in user profile' })
  @ApiBody({
    type: UpdateProfileDto,
    examples: {
      dealerProfile: {
        value: {
          username: 'dealer_username',
          shopName: 'ABC Electricals',
          contactNumber: '+91 9876543210',
          address: 'Complete shop address',
        },
      },
    },
  })
  @ApiOkResponse({
    description: 'The saved profile fields for the signed-in user.',
  })
  updateProfile(
    @Req() request: Request & { user: JwtPayload },
    @Body() updateProfileDto: UpdateProfileDto,
  ): Promise<ProfileResponse> {
    return this.profileService.updateProfile(
      request.user.sub,
      updateProfileDto,
    );
  }
}
