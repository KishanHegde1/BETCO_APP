import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/** JWT guard shell. Attach it after the authentication strategy is implemented. */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
