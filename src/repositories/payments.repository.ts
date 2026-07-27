import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { DealerPayment } from '../entities/dealer-payment.entity';

@Injectable()
export class PaymentsRepository {
  constructor(
    @InjectRepository(DealerPayment)
    readonly repository: Repository<DealerPayment>,
  ) {}
}
