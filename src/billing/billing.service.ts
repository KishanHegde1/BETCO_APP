import { Injectable } from '@nestjs/common';

import { BillingRepository } from '../repositories/billing.repository';
import { ApiErrorException } from '../common/exceptions/api-error.exception';
import { TallyInvoiceQueryDto } from '../tally/dto/tally-read-query.dto';
import { TallyReadService } from '../tally/services/tally-read.service';

/** Invoice, outstanding, and Tally read models will be implemented later. */
@Injectable()
export class BillingService {
  constructor(
    readonly billingRepository: BillingRepository,
    private readonly tallyReadService: TallyReadService,
  ) {}

  myInvoices(userId: string, query: TallyInvoiceQueryDto) {
    return this.tallyReadService.dealerInvoices(userId, query);
  }

  myInvoice(userId: string, id: string) {
    return this.tallyReadService.dealerInvoice(userId, id);
  }

  async myInvoicePdf(userId: string, id: string) {
    const invoice = await this.tallyReadService.dealerInvoice(userId, id);
    if (!invoice.pdfUrl) {
      throw new ApiErrorException(
        404,
        'INVOICE_NOT_AVAILABLE',
        'The exact Tally PDF has not been synchronized for this invoice.',
      );
    }
    // The source URL must later be replaced with a short-lived signed URL
    // when Tally exports PDFs. It is never manufactured by this application.
    return {
      invoiceId: id,
      pdfUrl: invoice.pdfUrl,
      pdfStatus: invoice.pdfStatus,
    };
  }
}
