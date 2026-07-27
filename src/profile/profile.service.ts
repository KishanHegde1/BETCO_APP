import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { DealersService } from '../dealers/dealers.service';
import { User } from '../entities/user.entity';
import { UsersService } from '../users/users.service';
import { UpdateProfileDto } from './dto/update-profile.dto';

export interface ProfileResponse {
  id: string;
  username: string;
  role: User['role'];
  shopName: string | null;
  contactNumber: string | null;
  address: string | null;
}

@Injectable()
export class ProfileService {
  constructor(
    private readonly usersService: UsersService,
    private readonly dealersService: DealersService,
  ) {}

  async getProfile(userId: string): Promise<ProfileResponse> {
    const user = await this.usersService.findActiveById(userId);
    if (!user) {
      throw new NotFoundException('Profile not found.');
    }

    return this.toProfileResponse(user);
  }

  async updateProfile(
    userId: string,
    updateProfileDto: UpdateProfileDto,
  ): Promise<ProfileResponse> {
    const user = await this.usersService.findActiveById(userId);
    if (!user) {
      throw new NotFoundException('Profile not found.');
    }

    const username = updateProfileDto.username?.trim();
    if (username && username.toLowerCase() !== user.username.toLowerCase()) {
      const existingUser = await this.usersService.findByUsername(username);
      if (existingUser && existingUser.id !== user.id) {
        throw new ConflictException('That username is already in use.');
      }
      user.username = username;
    }

    const hasDealerUpdate =
      updateProfileDto.shopName !== undefined ||
      updateProfileDto.contactNumber !== undefined ||
      updateProfileDto.address !== undefined;
    let dealer = await this.dealersService.findByUserId(user.id);
    if (!dealer && hasDealerUpdate) {
      dealer = this.dealersService.create({
        userId: user.id,
        businessName: updateProfileDto.shopName ?? user.username,
        phone: updateProfileDto.contactNumber ?? user.phone,
        address: updateProfileDto.address ?? null,
      });
    } else if (dealer) {
      if (updateProfileDto.shopName !== undefined) {
        dealer.businessName = updateProfileDto.shopName;
      }
      if (updateProfileDto.contactNumber !== undefined) {
        dealer.phone = updateProfileDto.contactNumber;
      }
      if (updateProfileDto.address !== undefined) {
        dealer.address = updateProfileDto.address;
      }
    }

    const updatedUser = await this.usersService.save(user);
    if (dealer) {
      await this.dealersService.save(dealer);
    }
    return this.toProfileResponse(updatedUser);
  }

  private async toProfileResponse(user: User): Promise<ProfileResponse> {
    const dealer = await this.dealersService.findByUserId(user.id);
    return {
      id: user.id,
      username: user.username,
      role: user.role,
      shopName: dealer?.businessName ?? null,
      contactNumber: dealer?.phone ?? user.phone ?? null,
      address: dealer?.address ?? null,
    };
  }
}
