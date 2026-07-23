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
    return mode === 'mock';
  }

  private getZarinpalMerchantId() {
    const merchantId = process.env.ZARINPAL_MERCHANT_ID?.trim();
    if (!merchantId) {
      throw new BadRequestException('ZARINPAL_MERCHANT_ID is not configured');
    }
    return merchantId;
  }

  private getZarinpalEndpoints() {
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

  private getZibalMerchantId() {
    const raw = process.env.ZIBAL_MERCHANT_ID?.trim();
    if (!raw) {
      throw new BadRequestException('ZIBAL_MERCHANT_ID is not configured');
    }
    return raw;
  }

  private getZibalEndpoints() {
    const base =
      process.env.ZIBAL_BASE_URL?.trim().replace(/\/+$/, '') ||
      'https://gateway.zibal.ir';
    return {
      request: `${base}/v1/request`,
      verify: `${base}/v1/verify`,
      startPay: `${base}/start/`,
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

    const merchantId = this.getZarinpalMerchantId();
    const endpoints = this.getZarinpalEndpoints();

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

    const merchantId = this.getZarinpalMerchantId();
    const endpoints = this.getZarinpalEndpoints();

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

  async requestZibalPayment(params: {
    amountRial: number;
    description: string;
    callbackUrl: string;
  }): Promise<PaymentRequestResult> {
    if (this.isMockMode()) {
      const authority = `MOCK-${randomUUID()}`;
      return { authority, paymentUrl: null, isMock: true };
    }

    const merchant = this.getZibalMerchantId();
    const endpoints = this.getZibalEndpoints();
    const amount = Math.max(0, Math.floor(params.amountRial));
    if (!Number.isFinite(amount) || amount < 1000) {
      throw new BadRequestException('Amount is invalid for Zibal');
    }

    const body = {
      merchant,
      amount,
      callbackUrl: params.callbackUrl,
      description: params.description,
    };

    const response = await fetch(endpoints.request, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const json: any = await response.json().catch(() => null);
    const result = Number(json?.result);
    const trackId = json?.trackId != null ? String(json.trackId) : '';
    if (!response.ok || result !== 100 || !trackId) {
      const message =
        json?.message || json?.statusMessage || 'Zibal payment request failed';
      throw new BadRequestException(message);
    }

    return {
      authority: trackId,
      paymentUrl: `${endpoints.startPay}${encodeURIComponent(trackId)}`,
      isMock: false,
    };
  }

  async verifyZibalPayment(params: {
    trackId: string;
  }): Promise<PaymentVerifyResult> {
    if (this.isMockMode()) {
      return { refId: `MOCK-${Date.now()}` };
    }

    const merchant = this.getZibalMerchantId();
    const endpoints = this.getZibalEndpoints();
    const trackId = params.trackId?.trim();
    if (!trackId) {
      throw new BadRequestException('trackId is required');
    }

    const body = {
      merchant,
      trackId: Number(trackId),
    };

    const response = await fetch(endpoints.verify, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const json: any = await response.json().catch(() => null);
    const result = Number(json?.result);
    const status = Number(json?.status);
    const refId = json?.refNumber != null ? String(json.refNumber) : '';
    if (!response.ok || result !== 100 || status !== 1 || !refId) {
      const message =
        json?.message || json?.statusMessage || 'Zibal payment verify failed';
      throw new BadRequestException(message);
    }

    return { refId };
  }
}
