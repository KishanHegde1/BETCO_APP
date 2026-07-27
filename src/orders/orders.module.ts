import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Dealer, Order, OrderItem } from '../entities';
import { DealersRepository } from '../repositories/dealers.repository';
import { OrdersRepository } from '../repositories/orders.repository';
import { NotificationsModule } from '../notifications/notifications.module';
import { UsersModule } from '../users/users.module';
import { AdminOrdersController } from './admin-orders.controller';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { StaffBillingController } from './staff-billing.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Order, OrderItem, Dealer]),
    UsersModule,
    NotificationsModule,
  ],
  controllers: [
    OrdersController,
    AdminOrdersController,
    StaffBillingController,
  ],
  providers: [OrdersService, OrdersRepository, DealersRepository],
  exports: [OrdersService],
})
export class OrdersModule {}
