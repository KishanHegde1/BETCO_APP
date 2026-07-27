import { Module } from '@nestjs/common';

import { DealersModule } from '../dealers/dealers.module';
import { UsersModule } from '../users/users.module';
import { ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';
import { UserProfileController } from './user-profile.controller';

@Module({
  imports: [UsersModule, DealersModule],
  controllers: [ProfileController, UserProfileController],
  providers: [ProfileService],
  exports: [ProfileService],
})
export class ProfileModule {}
