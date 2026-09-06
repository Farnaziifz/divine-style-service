import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { TorobApiException } from '../torob-api.exception';

const SUPPORTED_TOKEN_VERSION = '1';

/**
 * درخواست‌های ترب حاوی هدر X-Torob-Token (JWT امضاشده با کلید خصوصی ترب) هستند.
 * صحت درخواست با کلید عمومی‌ای که ترب هنگام ثبت درگاه در اختیارمان گذاشته بررسی می‌شود.
 */
@Injectable()
export class TorobTokenGuard implements CanActivate {
  private readonly logger = new Logger(TorobTokenGuard.name);

  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();

    const tokenVersion = request.header('x-torob-token-version');
    if (tokenVersion !== SUPPORTED_TOKEN_VERSION) {
      throw new TorobApiException('unsupported or missing X-Torob-Token-Version header');
    }

    const token = request.header('x-torob-token');
    if (!token) {
      throw new TorobApiException('missing X-Torob-Token header');
    }

    const publicKey = (process.env.TOROB_PUBLIC_KEY ?? '').replace(/\\n/g, '\n');
    if (!publicKey) {
      this.logger.error('TOROB_PUBLIC_KEY env var is not configured');
      throw new TorobApiException('torob integration is not configured');
    }

    try {
      await this.jwtService.verifyAsync(token, {
        publicKey,
        algorithms: ['RS256'],
      });
    } catch (err) {
      this.logger.warn(`Rejected torob request: invalid token (${err instanceof Error ? err.message : err})`);
      throw new TorobApiException('invalid X-Torob-Token');
    }

    return true;
  }
}
