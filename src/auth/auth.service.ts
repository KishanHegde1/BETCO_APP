import {
  BadRequestException,
  ConflictException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { sign, SignOptions } from 'jsonwebtoken';
import { DataSource, QueryFailedError } from 'typeorm';

import { UserRole } from '../common/constants/user-role.enum';
import { UsersService } from '../users/users.service';
import { ApiErrorException } from '../common/exceptions/api-error.exception';
import { Dealer } from '../entities/dealer.entity';
import { User } from '../entities/user.entity';
import { ChangePasswordDto } from './dto/change-password.dto';
import { RegisterDealerDto } from './dto/register-dealer.dto';
import { SignInDto } from './dto/sign-in.dto';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { LoginResult } from './interfaces/login-result.interface';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource,
  ) {}

  async signIn({ username, password }: SignInDto): Promise<LoginResult> {
    const normalizedUsername = username.trim();
    const normalizedPassword = password.trim();
    // This intentionally does not require a dealer profile and does not limit
    // roles. STAFF, USER, and ADMIN all use the same credentials flow.
    const user = await this.usersService.findByUsername(normalizedUsername);
    const isPasswordValid = user
      ? await bcrypt.compare(normalizedPassword, user.passwordHash)
      : false;

    if (!isPasswordValid || !user) {
      throw new UnauthorizedException('Invalid username or password.');
    }
    if (!user.isActive) {
      throw new ApiErrorException(
        HttpStatus.FORBIDDEN,
        'ACCOUNT_INACTIVE',
        'This account is inactive.',
      );
    }

    return this.createLoginResult(user);
  }

  async registerDealer(dto: RegisterDealerDto): Promise<LoginResult> {
    if (dto.password !== dto.confirmPassword) {
      throw new BadRequestException('Password and confirmation must match.');
    }
    if (dto.password !== dto.password.trim()) {
      throw new BadRequestException(
        'Password cannot begin or end with a space.',
      );
    }
    const username = this.requiredText(dto.username, 'Username', 3);
    const phone = dto.phone.trim();
    const shopName = this.requiredText(dto.shopName, 'Business / shop name', 2);
    const email = this.optionalText(dto.email);
    const address = this.optionalText(dto.address);

    try {
      const user = await this.dataSource.transaction(async (manager) => {
        const users = manager.getRepository(User);
        const existing = await users
          .createQueryBuilder('user')
          .where(
            'LOWER(BTRIM(user.username)) = LOWER(BTRIM(:username)) OR user.phone = :phone OR (:email IS NOT NULL AND LOWER(BTRIM(user.email)) = LOWER(BTRIM(:email)))',
            { username, phone, email },
          )
          .getOne();
        if (existing) {
          throw new ConflictException(
            'Username, phone number, or email address is already in use.',
          );
        }

        const user = await users.save(
          users.create({
            username,
            phone,
            email,
            passwordHash: await bcrypt.hash(dto.password, 12),
            role: UserRole.USER,
            isActive: true,
            mustChangePassword: false,
          }),
        );
        await manager.getRepository(Dealer).save(
          manager.getRepository(Dealer).create({
            userId: user.id,
            businessName: shopName,
            shopName,
            phone,
            contactNumber: phone,
            address,
          }),
        );
        return user;
      });
      return this.createLoginResult(user);
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException(
          'Username, phone number, or email address is already in use.',
        );
      }
      throw error;
    }
  }

  private createLoginResult(user: User): LoginResult {
    const secret = this.configService.get<string>('jwt.secret');
    if (!secret) {
      throw new Error('JWT_SECRET must be configured before starting the API.');
    }

    const payload: JwtPayload = {
      sub: user.id,
      username: user.username,
      role: user.role,
    };
    const expiresIn = this.configService.get<string>('jwt.expiresIn') ?? '15d';
    const accessToken = sign(payload, secret, {
      expiresIn: expiresIn as SignOptions['expiresIn'],
    });

    return {
      accessToken,
      user: {
        id: user.id,
        username: user.username,
        phone: user.phone,
        role: user.role,
        mustChangePassword: user.mustChangePassword,
      },
    };
  }

  async changePassword(
    userId: string,
    { currentPassword, newPassword }: ChangePasswordDto,
  ): Promise<void> {
    const user = await this.usersService.findActiveById(userId);
    if (!user || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
      throw new UnauthorizedException('Current password is incorrect.');
    }
    if (await bcrypt.compare(newPassword, user.passwordHash)) {
      throw new UnauthorizedException(
        'Choose a password different from the current password.',
      );
    }

    user.passwordHash = await bcrypt.hash(newPassword, 12);
    user.mustChangePassword = false;
    await this.usersService.save(user);
  }

  private requiredText(
    value: string,
    label: string,
    minimumLength: number,
  ): string {
    const normalized = value.trim();
    if (normalized.length < minimumLength) {
      throw new BadRequestException(
        `${label} must contain at least ${minimumLength} characters.`,
      );
    }
    return normalized;
  }

  private optionalText(value: string | undefined): string | null {
    const normalized = value?.trim();
    return normalized || null;
  }

  private isUniqueViolation(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) return false;
    const driverError = error.driverError as { code?: unknown } | undefined;
    return driverError?.code === '23505';
  }
}
