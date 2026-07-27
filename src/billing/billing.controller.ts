import { Controller } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('Billing')
@Controller({ path: 'billing', version: '1' })
export class BillingController {}
