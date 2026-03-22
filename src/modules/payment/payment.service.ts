import { Injectable } from '@nestjs/common';
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

    const merchantId = process.env.ZARINPAL_MERCHANT_ID;
    if (!merchantId) {
      const authority = `MOCK-${randomUUID()}`;
      return { authority, paymentUrl: null, isMock: true };
    }

    const body = {
      merchant_id: merchantId,
      amount: params.amountToman,
      callback_url: params.callbackUrl,
      description: params.description,
      metadata: params.mobile ? { mobile: params.mobile } : undefined,
    };

    const response = await fetch(
      'https://api.zarinpal.com/pg/v4/payment/request.json',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
    );

    const json: any = await response.json();
    const authority = json?.data?.authority;
    if (!authority) {
      const fallback = `MOCK-${randomUUID()}`;
      return { authority: fallback, paymentUrl: null, isMock: true };
    }

    return {
      authority,
      paymentUrl: `https://www.zarinpal.com/pg/StartPay/${authority}`,
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

    const merchantId = process.env.ZARINPAL_MERCHANT_ID;
    if (!merchantId) {
      return { refId: `MOCK-${Date.now()}` };
    }

    const body = {
      merchant_id: merchantId,
      amount: params.amountToman,
      authority: params.authority,
    };

    const response = await fetch(
      'https://api.zarinpal.com/pg/v4/payment/verify.json',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
    );

    const json: any = await response.json();
    const refId = json?.data?.ref_id;
    return { refId: String(refId ?? '') };
  }
}
