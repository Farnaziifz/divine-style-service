import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * مستندات TorobAPI v3 فرمت خطای ثابت {"error": "..."} را انتظار دارد،
 * نه فرمت پیش‌فرض Nest ({statusCode, message, error}).
 */
export class TorobApiException extends HttpException {
  constructor(message: string, status: HttpStatus = HttpStatus.BAD_REQUEST) {
    super({ error: message }, status);
  }
}
