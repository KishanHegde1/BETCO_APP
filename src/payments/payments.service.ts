import { Injectable } from '@nestjs/common';

import { PaymentsRepository } from '../repositories/payments.repository';

/** Payment and allocation logic is intentionally deferred. */
@Injectable()
export class PaymentsService {
  constructor(readonly paymentsRepository: PaymentsRepository) {}
}
