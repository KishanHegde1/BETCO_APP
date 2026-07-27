import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Category } from '../entities/category.entity';
import { DailyStock } from '../entities/daily-stock.entity';
import { Dealer } from '../entities/dealer.entity';
import { Order } from '../entities/order.entity';
import { OrderItem } from '../entities/order-item.entity';
import { Product } from '../entities/product.entity';
import { User } from '../entities/user.entity';
import { AdminDealersRepository } from '../repositories/admin-dealers.repository';
import { OrdersRepository } from '../repositories/orders.repository';
import { AdminDealersController } from './admin-dealers.controller';
import { AdminDealersService } from './admin-dealers.service';
import { AdminDashboardController } from './admin-dashboard.controller';
import { AdminDashboardService } from './admin-dashboard.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Category,
      Product,
      DailyStock,
      Dealer,
      User,
      Order,
      OrderItem,
    ]),
  ],
  controllers: [AdminDashboardController, AdminDealersController],
  providers: [
    AdminDashboardService,
    AdminDealersService,
    AdminDealersRepository,
    OrdersRepository,
  ],
})
export class AdminModule {}
