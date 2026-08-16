import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CloudinaryModule } from '../cloudinary/cloudinary.module';
import { PmSuryaGharApplication, PmSuryaGharDocument, User } from '../entities';
import { PmSuryaGharController } from './pm-surya-ghar.controller';
import { PmSuryaGharService } from './pm-surya-ghar.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PmSuryaGharApplication,
      PmSuryaGharDocument,
      User,
    ]),
    CloudinaryModule,
  ],
  controllers: [PmSuryaGharController],
  providers: [PmSuryaGharService],
  exports: [PmSuryaGharService],
})
export class PmSuryaGharModule {}
