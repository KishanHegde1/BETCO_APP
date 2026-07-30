import { Module } from '@nestjs/common';

import { TypeOrmModule } from '@nestjs/typeorm';

import {
  Dealer,
  DealerInvoice,
  DealerInvoiceItem,
  DealerPayment,
  TallyDealerMapping,
  TallyLedger,
  TallySyncCheckpoint,
  TallySyncRun,
} from '../entities';
import { TallySyncRepository } from '../repositories/tally-sync.repository';
import { TallyController } from './controllers/tally.controller';
import { TallyConnectorAuthGuard } from './guards/tally-connector-auth.guard';
import { TallyConnectorService } from './services/tally-connector.service';
import { TallyReadService } from './services/tally-read.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Dealer,
      DealerInvoice,
      DealerInvoiceItem,
      DealerPayment,
      TallyDealerMapping,
      TallyLedger,
      TallySyncCheckpoint,
      TallySyncRun,
    ]),
  ],
  controllers: [TallyController],
  providers: [
    TallyConnectorService,
    TallyReadService,
    TallyConnectorAuthGuard,
    TallySyncRepository,
  ],
  exports: [TallyConnectorService, TallyReadService],
})
export class TallyModule {}
