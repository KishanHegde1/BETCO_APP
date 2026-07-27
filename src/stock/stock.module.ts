import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { DailyStock } from '../entities/daily-stock.entity';
import { Product } from '../entities/product.entity';
import { AdminStockController } from './admin-stock.controller';
import { DailyStockRepository } from '../repositories/daily-stock.repository';
import { StockController } from './stock.controller';
import { StockService } from './stock.service';

@Module({
  imports: [TypeOrmModule.forFeature([DailyStock, Product])],
  controllers: [StockController, AdminStockController],
  providers: [StockService, DailyStockRepository],
  exports: [StockService],
})
export class StockModule {}
