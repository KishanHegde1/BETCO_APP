import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EntityManager } from 'typeorm';

import { UserRole } from '../common/constants/user-role.enum';
import { Dealer } from '../entities/dealer.entity';
import { User } from '../entities/user.entity';
import { DealersService } from '../dealers/dealers.service';
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
    return this.usersService.usersRepository.repository.manager.transaction(
      async (manager) => this.upsertProfile(manager, userId, updateProfileDto),
    );
  }

  private async upsertProfile(
    manager: EntityManager,
    userId: string,
    updateProfileDto: UpdateProfileDto,
  ): Promise<ProfileResponse> {
    const users = manager.getRepository(User);
    const user = await users.findOne({ where: { id: userId, isActive: true } });
    if (!user) {
      throw new NotFoundException('Profile not found.');
    }

    const username = updateProfileDto.username?.trim();
    if (username && username.toLowerCase() !== user.username.toLowerCase()) {
      const existingUser = await users
        .createQueryBuilder('user')
        .where('LOWER(user.username) = LOWER(:username)', { username })
        .getOne();
      if (existingUser && existingUser.id !== user.id) {
        throw new ConflictException('That username is already in use.');
      }
      user.username = username;
    }

    let dealer: Dealer | null = null;
    if (user.role === UserRole.USER) {
      const dealers = manager.getRepository(Dealer);
      dealer = await dealers.findOne({
        where: { userId: user.id },
        lock: { mode: 'pessimistic_write' },
      });
      const shopName =
        updateProfileDto.shopName ?? updateProfileDto.businessName;
      const contactNumber =
        updateProfileDto.contactNumber ?? updateProfileDto.phone;

      if (!dealer) {
        dealer = dealers.create({
          userId: user.id,
          businessName:
            updateProfileDto.businessName ?? shopName ?? user.username,
          shopName: shopName ?? updateProfileDto.businessName ?? user.username,
          phone: updateProfileDto.phone ?? contactNumber ?? user.phone,
          contactNumber: contactNumber ?? updateProfileDto.phone ?? user.phone,
          address: updateProfileDto.address ?? null,
        });
      } else {
        if (updateProfileDto.businessName !== undefined) {
          dealer.businessName = updateProfileDto.businessName;
        } else if (shopName !== undefined) {
          dealer.businessName = shopName;
        }
        if (shopName !== undefined) dealer.shopName = shopName;
        if (updateProfileDto.phone !== undefined)
          dealer.phone = updateProfileDto.phone;
        if (contactNumber !== undefined) {
          dealer.contactNumber = contactNumber;
          dealer.phone ??= contactNumber;
        }
        if (updateProfileDto.address !== undefined) {
          dealer.address = updateProfileDto.address;
        }
      }
    }

    const updatedUser = await users.save(user);
    if (dealer) await manager.getRepository(Dealer).save(dealer);
    return this.toProfileResponse(updatedUser, dealer);
  }

  private async toProfileResponse(
    user: User,
    resolvedDealer?: Dealer | null,
  ): Promise<ProfileResponse> {
    const dealer =
      resolvedDealer === undefined
        ? await this.dealersService.findByUserId(user.id)
        : resolvedDealer;
    return {
      id: user.id,
      username: user.username,
      role: user.role,
      shopName: dealer?.shopName ?? dealer?.businessName ?? null,
      contactNumber:
        dealer?.contactNumber ?? dealer?.phone ?? user.phone ?? null,
      address: dealer?.address ?? null,
    };
  }
}
