import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';

export type PaymentRequestResult = {
  authority: string;
  paymentUrl: string | null;
  isMock: boolean;
};

export type PaymentVerifyResult = {
  refId: string;
};

@Injectable()
export class PaymentService {
  isMockMode() {
    const mode = (process.env.PAYMENT_MODE ?? 'mock').toLowerCase();
    return mode !== 'zarinpal';
  }

  private getMerchantId() {
    const merchantId = process.env.ZARINPAL_MERCHANT_ID?.trim();
    if (!merchantId) {
      throw new BadRequestException('ZARINPAL_MERCHANT_ID is not configured');
    }
    return merchantId;
  }

  private getEndpoints() {
    const isSandbox =
      (process.env.ZARINPAL_SANDBOX ?? 'false').toLowerCase() === 'true';
    if (isSandbox) {
      return {
        request:
          'https://sandbox.banktest.ir/zarinpal/api.zarinpal.com/pg/v4/payment/request.json',
        verify:
          'https://sandbox.banktest.ir/zarinpal/api.zarinpal.com/pg/v4/payment/verify.json',
        startPay:
          'https://sandbox.banktest.ir/zarinpal/www.zarinpal.com/pg/StartPay/',
      };
    }
    return {
      request: 'https://api.zarinpal.com/pg/v4/payment/request.json',
      verify: 'https://api.zarinpal.com/pg/v4/payment/verify.json',
      startPay: 'https://www.zarinpal.com/pg/StartPay/',
    };
  }

  async requestZarinpalPayment(params: {
    amountToman: number;
    description: string;
    callbackUrl: string;
    mobile?: string;
  }): Promise<PaymentRequestResult> {
    if (this.isMockMode()) {
      const authority = `MOCK-${randomUUID()}`;
      return { authority, paymentUrl: null, isMock: true };
    }

    const merchantId = this.getMerchantId();
    const endpoints = this.getEndpoints();

    const body = {
      merchant_id: merchantId,
      amount: params.amountToman,
      callback_url: params.callbackUrl,
      description: params.description,
      metadata: params.mobile ? { mobile: params.mobile } : undefined,
    };

    const response = await fetch(endpoints.request, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const json: any = await response.json();
    const code = Number(json?.data?.code);
    const authority = json?.data?.authority
      ? String(json.data.authority)
      : null;
    if (!response.ok || code !== 100 || !authority) {
      const message =
        json?.errors?.message ||
        json?.data?.message ||
        'Payment request failed';
      throw new BadRequestException(message);
    }

    return {
      authority,
      paymentUrl: `${endpoints.startPay}${authority}`,
      isMock: false,
    };
  }

  async verifyZarinpalPayment(params: {
    authority: string;
    amountToman: number;
  }): Promise<PaymentVerifyResult> {
    if (this.isMockMode()) {
      return { refId: `MOCK-${Date.now()}` };
    }

    const merchantId = this.getMerchantId();
    const endpoints = this.getEndpoints();

    const body = {
      merchant_id: merchantId,
      amount: params.amountToman,
      authority: params.authority,
    };

    const response = await fetch(endpoints.verify, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const json: any = await response.json();
    const code = Number(json?.data?.code);
    const refId = json?.data?.ref_id != null ? String(json.data.ref_id) : '';
    if (!response.ok || (code !== 100 && code !== 101) || !refId) {
      const message =
        json?.errors?.message || json?.data?.message || 'Payment verify failed';
      throw new BadRequestException(message);
    }
    return { refId };
  }
}
