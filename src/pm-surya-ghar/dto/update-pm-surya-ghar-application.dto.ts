import { PartialType } from '@nestjs/swagger';

import { CreatePmSuryaGharApplicationDto } from './create-pm-surya-ghar-application.dto';

export class UpdatePmSuryaGharApplicationDto extends PartialType(
  CreatePmSuryaGharApplicationDto,
) {}
