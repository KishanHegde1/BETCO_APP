import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { UserRole } from '../common/constants/user-role.enum';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Notification } from '../entities/notification.entity';
import { NotificationsService } from './notifications.service';

@ApiTags('Notifications')
@Controller({ path: 'notifications', version: '1' })
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.USER, UserRole.STAFF)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get('my')
  findMine(@Req() request: { user: JwtPayload }): Promise<Notification[]> {
    return this.notificationsService.findMine(request.user.sub);
  }
}
