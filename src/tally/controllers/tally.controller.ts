import { Controller } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('Tally')
@Controller({ path: 'tally', version: '1' })
export class TallyController {}
