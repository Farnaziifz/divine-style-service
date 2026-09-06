import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';

/**
 * همه‌ی خطاهای این کنترلر (اعم از ValidationPipe یا throw دستی) را به فرمت ثابت
 * {"error": "..."} تبدیل می‌کند، طبق مستندات TorobAPI v3.
 */
@Catch(HttpException)
export class TorobErrorFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const status = exception.getStatus();
    const body = exception.getResponse();

    let message: string;
    if (typeof body === 'string') {
      message = body;
    } else if (body && typeof body === 'object' && 'error' in body) {
      message = String((body as { error: unknown }).error);
    } else if (body && typeof body === 'object' && 'message' in body) {
      const raw = (body as { message: unknown }).message;
      message = Array.isArray(raw) ? raw.join(', ') : String(raw);
    } else {
      message = exception.message;
    }

    response.status(status ?? HttpStatus.BAD_REQUEST).json({ error: message });
  }
}
