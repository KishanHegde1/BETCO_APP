import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Dealer, Order, OrderItem } from '../entities';
import { DealersRepository } from '../repositories/dealers.repository';
import { OrdersRepository } from '../repositories/orders.repository';
import { UsersModule } from '../users/users.module';
import { AdminOrdersController } from './admin-orders.controller';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [TypeOrmModule.forFeature([Order, OrderItem, Dealer]), UsersModule],
  controllers: [OrdersController, AdminOrdersController],
  providers: [OrdersService, OrdersRepository, DealersRepository],
  exports: [OrdersService],
})
export class OrdersModule {}
