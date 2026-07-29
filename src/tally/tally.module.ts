import { Module } from '@nestjs/common';

import { TypeOrmModule } from '@nestjs/typeorm';

import {
  Dealer,
  DealerInvoice,
  DealerInvoiceItem,
  DealerPayment,
  TallyDealerMapping,
  TallySyncCheckpoint,
  TallySyncRun,
} from '../entities';
import { TallySyncRepository } from '../repositories/tally-sync.repository';
import { TallyController } from './controllers/tally.controller';
import { TallyConnectorAuthGuard } from './guards/tally-connector-auth.guard';
import { TallyConnectorService } from './services/tally-connector.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Dealer,
      DealerInvoice,
      DealerInvoiceItem,
      DealerPayment,
      TallyDealerMapping,
      TallySyncCheckpoint,
      TallySyncRun,
    ]),
  ],
  controllers: [TallyController],
  providers: [
    TallyConnectorService,
    TallyConnectorAuthGuard,
    TallySyncRepository,
  ],
  exports: [TallyConnectorService],
})
export class TallyModule {}
