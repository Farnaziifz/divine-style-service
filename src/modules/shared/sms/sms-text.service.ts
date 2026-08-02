import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class SmsTextService {
  private readonly logger = new Logger(SmsTextService.name);

  private getConfig() {
    const apiKey = process.env.SMS_IR_API_KEY?.trim() || '';
    const lineNumber = process.env.SMS_IR_LINE_NUMBER?.trim() || '';
    const sendUrl =
      process.env.SMS_IR_SEND_URL?.trim() ||
      'https://api.sms.ir/v1/send/bulk';
    const logOnly =
      (process.env.SMS_LOG_OTP_ONLY || 'false').toLowerCase() === 'true';
    return { apiKey, lineNumber, sendUrl, logOnly };
  }

  async send(mobile: string, text: string): Promise<void> {
    const { apiKey, lineNumber, sendUrl, logOnly } = this.getConfig();

    if (logOnly) {
      this.logger.log(`SMS (log only) to ${mobile}: ${text}`);
      return;
    }

    if (!apiKey || !lineNumber) {
      this.logger.warn(
        `SMS not sent to ${mobile}: تنظیمات پیامک کامل نیست (SMS_IR_LINE_NUMBER)`,
      );
      return;
    }

    try {
      const res = await fetch(sendUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/plain, */*',
          'x-api-key': apiKey,
        },
        body: JSON.stringify({
          lineNumber,
          messageText: text,
          mobiles: [mobile],
        }),
      });

      const body = await res.json().catch(() => null);
      if (!res.ok || Number(body?.status) !== 1) {
        this.logger.warn(`SMS failed to ${mobile}: ${JSON.stringify(body)}`);
      }
    } catch (err) {
      this.logger.error(`SMS error to ${mobile}: ${(err as Error).message}`);
    }
  }

  buildAdminOrderNotificationText(
    customerMobile: string,
    orderCode: string,
    payableAmount: number,
  ): string {
    return (
      `🛍 سفارش جدید ثبت شد\n` +
      `شماره تماس مشتری: ${customerMobile}\n` +
      `شماره سفارش: ${orderCode}\n` +
      `مبلغ سفارش: ${payableAmount.toLocaleString('fa-IR')} تومان\n` +
      `دیواین استایل`
    );
  }

  buildCustomerOrderRegisteredText(orderCode: string): string {
    return (
      `✅ سفارش شما با موفقیت ثبت شد\n` +
      `شماره سفارش: ${orderCode}\n` +
      `از خرید شما سپاسگزاریم 🌸\n` +
      `دیواین استایل`
    );
  }

  buildOutOfStockAlertText(productTitles: string[]): string {
    const list = productTitles.map((t) => `• ${t}`).join('\n');
    return (
      `⚠️ موجودی محصولات زیر تمام شد\n` +
      `${list}\n` +
      `لطفا موجودی رو در پنل ادمین به‌روزرسانی کنید.\n` +
      `دیواین استایل`
    );
  }
}
