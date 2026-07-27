import { Injectable } from '@nestjs/common';

import { BillingRepository } from '../repositories/billing.repository';

/** Invoice, outstanding, and Tally read models will be implemented later. */
@Injectable()
export class BillingService {
  constructor(readonly billingRepository: BillingRepository) {}
}
