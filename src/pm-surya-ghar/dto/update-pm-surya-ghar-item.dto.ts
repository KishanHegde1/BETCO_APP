import { PartialType } from '@nestjs/swagger';

import { CreatePmSuryaGharItemDto } from './create-pm-surya-ghar-item.dto';

export class UpdatePmSuryaGharItemDto extends PartialType(
  CreatePmSuryaGharItemDto,
) {}
