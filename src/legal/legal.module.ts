import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AccountDeletionRequest } from '../entities/account-deletion-request.entity';
import { LegalController } from './legal.controller';
import { LegalService } from './legal.service';

@Module({
  imports: [TypeOrmModule.forFeature([AccountDeletionRequest])],
  controllers: [LegalController],
  providers: [LegalService],
})
export class LegalModule {}
