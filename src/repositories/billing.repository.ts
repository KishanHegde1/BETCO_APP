import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { DealerInvoice } from '../entities/dealer-invoice.entity';

@Injectable()
export class BillingRepository {
  constructor(
    @InjectRepository(DealerInvoice)
    readonly repository: Repository<DealerInvoice>,
  ) {}
}
