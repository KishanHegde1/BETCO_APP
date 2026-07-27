import { Controller } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('Dealers')
@Controller({ path: 'dealers', version: '1' })
export class DealersController {}
