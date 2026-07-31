import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { DealerPayment, DealerPaymentAllocation } from '../entities';
import { PaymentsRepository } from '../repositories/payments.repository';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { TallyModule } from '../tally/tally.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([DealerPayment, DealerPaymentAllocation]),
    TallyModule,
  ],
  controllers: [PaymentsController],
  providers: [PaymentsService, PaymentsRepository],
  exports: [PaymentsService],
})
export class PaymentsModule {}
