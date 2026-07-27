import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';

import {
  Notification,
  NotificationType,
} from '../entities/notification.entity';
import { NotificationsRepository } from '../repositories/notifications.repository';

export interface CreateNotificationInput {
  userId: string;
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
}
