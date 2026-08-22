import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { PriceListItem } from '../entities/price-list-item.entity';
import { PriceList } from '../entities/price-list.entity';
import { Product } from '../entities/product.entity';
import { PriceListsController } from './price-lists.controller';
import { PriceListsService } from './price-lists.service';

@Module({
  imports: [TypeOrmModule.forFeature([PriceList, PriceListItem, Product])],
  controllers: [PriceListsController],
  providers: [PriceListsService],
  exports: [PriceListsService],
})
export class PriceListsModule {}
