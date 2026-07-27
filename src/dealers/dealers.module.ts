import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Dealer } from '../entities/dealer.entity';
import { DealersRepository } from '../repositories/dealers.repository';
import { DealersController } from './dealers.controller';
import { DealersService } from './dealers.service';

@Module({
  imports: [TypeOrmModule.forFeature([Dealer])],
  controllers: [DealersController],
  providers: [DealersService, DealersRepository],
  exports: [DealersService],
})
export class DealersModule {}
