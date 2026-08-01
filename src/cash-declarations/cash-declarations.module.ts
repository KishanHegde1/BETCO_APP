import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CashDeclaration, Dealer, User } from '../entities';
import {
  AdminCashDeclarationsController,
  CashDeclarationsController,
  StaffCashDeclarationsController,
} from './cash-declarations.controller';
import { CashDeclarationsService } from './cash-declarations.service';

@Module({
  imports: [TypeOrmModule.forFeature([CashDeclaration, Dealer, User])],
  controllers: [
    CashDeclarationsController,
    AdminCashDeclarationsController,
    StaffCashDeclarationsController,
  ],
  providers: [CashDeclarationsService],
  exports: [CashDeclarationsService],
})
export class CashDeclarationsModule {}
