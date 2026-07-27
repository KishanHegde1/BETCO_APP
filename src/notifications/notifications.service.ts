import { Injectable } from '@nestjs/common';

import { NotificationsRepository } from '../repositories/notifications.repository';

@Injectable()
export class NotificationsService {
  constructor(readonly notificationsRepository: NotificationsRepository) {}
}
