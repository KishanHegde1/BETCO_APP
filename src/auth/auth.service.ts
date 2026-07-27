import {
  HttpStatus,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { sign, SignOptions } from 'jsonwebtoken';

import { UsersService } from '../users/users.service';
import { ApiErrorException } from '../common/exceptions/api-error.exception';
import { ChangePasswordDto } from './dto/change-password.dto';
import { SignInDto } from './dto/sign-in.dto';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { LoginResult } from './interfaces/login-result.interface';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly configService: ConfigService,
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

    if (this.configService.get<boolean>('app.authDiagnostics')) {
      this.logger.log(
        `AUTH_LOGIN_DIAGNOSTIC normalizedUsername=${normalizedUsername} userFound=${user !== null} role=${user?.role ?? 'none'} isActive=${user?.isActive ?? 'none'} bcryptCompareSucceeded=${isPasswordValid}`,
      );
    }

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
}
