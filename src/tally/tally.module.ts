import { Module } from '@nestjs/common';

import { TallyController } from './controllers/tally.controller';
import { TallyConnectorService } from './services/tally-connector.service';

@Module({
  controllers: [TallyController],
  providers: [TallyConnectorService],
  exports: [TallyConnectorService],
})
export class TallyModule {}
