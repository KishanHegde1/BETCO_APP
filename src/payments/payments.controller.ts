import { Controller } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('Payments')
@Controller({ path: 'payments', version: '1' })
export class PaymentsController {}
