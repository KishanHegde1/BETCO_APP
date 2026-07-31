import { NotFoundException, Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';

import {
  Notification,
  NotificationType,
} from '../entities/notification.entity';
import { NotificationsRepository } from '../repositories/notifications.repository';

export interface CreateNotificationInput {
  userId: string;
  orderId?: string | null;
  type: NotificationType;
  title: string;
  body: string;
}

@Injectable()
export class NotificationsService {
  constructor(readonly notificationsRepository: NotificationsRepository) {}

  findMine(userId: string): Promise<Notification[]> {
    return this.notificationsRepository.findByUserId(userId);
  }

  async create(
    input: CreateNotificationInput,
    manager?: EntityManager,
  ): Promise<Notification> {
    const repository =
      manager?.getRepository(Notification) ??
      this.notificationsRepository.repository;
    return repository.save(repository.create({ ...input, isRead: false }));
  }

  async markMineRead(userId: string, id: string): Promise<Notification> {
    const notification = await this.notificationsRepository.repository.findOne({
      where: { id, userId },
    });
    if (!notification) throw new NotFoundException('Notification not found.');
    notification.isRead = true;
    return this.notificationsRepository.repository.save(notification);
  }
}
