import { Body, Controller, Get, Put, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ProfileResponse, ProfileService } from './profile.service';

/** Canonical current-user profile route. The legacy /profile endpoints remain supported. */
@ApiTags('Users')
@ApiBearerAuth()
@Controller({ path: 'users/me/profile', version: '1' })
@UseGuards(JwtAuthGuard)
export class UserProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Get()
  @ApiOperation({ summary: 'Get the authenticated user profile' })
  getProfile(@Req() request: { user: JwtPayload }): Promise<ProfileResponse> {
    return this.profileService.getProfile(request.user.sub);
  }

  @Put()
  @ApiOperation({
    summary: 'Create or update the authenticated dealer profile',
  })
  updateProfile(
    @Req() request: { user: JwtPayload },
    @Body() updateProfileDto: UpdateProfileDto,
  ): Promise<ProfileResponse> {
    return this.profileService.updateProfile(
      request.user.sub,
      updateProfileDto,
    );
  }
}
