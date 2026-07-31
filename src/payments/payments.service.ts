import { Injectable } from '@nestjs/common';

import { PaymentsRepository } from '../repositories/payments.repository';
import { TallyPaymentQueryDto } from '../tally/dto/tally-read-query.dto';
import { TallyReadService } from '../tally/services/tally-read.service';

/** Payment and allocation logic is intentionally deferred. */
@Injectable()
export class PaymentsService {
  constructor(
    readonly paymentsRepository: PaymentsRepository,
    private readonly tallyReadService: TallyReadService,
  ) {}

  mySummary(userId: string) {
    return this.tallyReadService.dealerSummary(userId);
  }

  myTransactions(userId: string, query: TallyPaymentQueryDto) {
    return this.tallyReadService.dealerPayments(userId, query);
  }

  myTransaction(userId: string, id: string) {
    return this.tallyReadService.dealerPayment(userId, id);
  }
}
