import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CloudinaryModule } from '../cloudinary/cloudinary.module';
import { SolarProject } from '../entities/solar-project.entity';
import { SolarProjectMedia } from '../entities/solar-project-media.entity';
import {
  AdminSolarProjectsController,
  SolarProjectsController,
} from './solar-projects.controller';
import { SolarProjectsService } from './solar-projects.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([SolarProject, SolarProjectMedia]),
    CloudinaryModule,
  ],
  controllers: [SolarProjectsController, AdminSolarProjectsController],
  providers: [SolarProjectsService],
  exports: [SolarProjectsService],
})
export class SolarProjectsModule {}
