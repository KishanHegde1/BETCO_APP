import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';

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

@Injectable()
export class TallySyncRepository {
  constructor(
    @InjectRepository(Dealer) readonly dealers: Repository<Dealer>,
    @InjectRepository(DealerInvoice)
    readonly invoices: Repository<DealerInvoice>,
    @InjectRepository(DealerInvoiceItem)
    readonly invoiceItems: Repository<DealerInvoiceItem>,
    @InjectRepository(DealerPayment)
    readonly payments: Repository<DealerPayment>,
    @InjectRepository(TallyDealerMapping)
    readonly mappings: Repository<TallyDealerMapping>,
    @InjectRepository(TallyLedger)
    readonly ledgers: Repository<TallyLedger>,
    @InjectRepository(TallySyncCheckpoint)
    readonly checkpoints: Repository<TallySyncCheckpoint>,
    @InjectRepository(TallySyncRun)
    readonly syncRuns: Repository<TallySyncRun>,
  ) {}

  transaction<T>(callback: (manager: EntityManager) => Promise<T>): Promise<T> {
    return this.dealers.manager.transaction(callback);
  }
}
