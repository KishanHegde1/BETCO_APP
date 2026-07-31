import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { DailyStock } from '../entities/daily-stock.entity';
import { Product } from '../entities/product.entity';
import { Category } from '../entities/category.entity';
import { StockMovement } from '../entities/stock-movement.entity';
import { AdminStockController } from './admin-stock.controller';
import { DailyStockRepository } from '../repositories/daily-stock.repository';
import { StockController } from './stock.controller';
import { StaffStockController } from './staff-stock.controller';
import { StockService } from './stock.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([DailyStock, Product, Category, StockMovement]),
  ],
  controllers: [StockController, AdminStockController, StaffStockController],
  providers: [StockService, DailyStockRepository],
  exports: [StockService],
})
export class StockModule {}
