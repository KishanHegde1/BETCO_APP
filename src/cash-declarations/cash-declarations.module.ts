import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CloudinaryModule } from '../cloudinary/cloudinary.module';
import { CashDeclaration, Dealer, User } from '../entities';
import {
  AdminCashDeclarationsController,
  CashDeclarationsController,
  StaffCashDeclarationsController,
} from './cash-declarations.controller';
import { CashDeclarationsService } from './cash-declarations.service';
import { CashProofRetentionService } from './cash-proof-retention.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([CashDeclaration, Dealer, User]),
    CloudinaryModule,
  ],
  controllers: [
    CashDeclarationsController,
    AdminCashDeclarationsController,
    StaffCashDeclarationsController,
  ],
  providers: [CashDeclarationsService, CashProofRetentionService],
  exports: [CashDeclarationsService],
})
export class CashDeclarationsModule {}
