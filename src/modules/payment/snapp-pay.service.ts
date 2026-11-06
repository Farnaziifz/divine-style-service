import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { randomInt } from 'crypto';
import { PrismaService } from '../shared/prisma/prisma.service';

export type SnappPayMethodType = 'POSTPAID' | 'INSTALLMENT' | 'FINANCING';
export const SNAPPPAY_METHOD_TYPES: SnappPayMethodType[] = [
  'INSTALLMENT',
  'POSTPAID',
  'FINANCING',
];

/** Keys stored in SiteSetting — everything an admin may change without a deploy. */
export const SNAPPPAY_SETTING_KEYS = {
  enabled: 'SNAPPPAY_ENABLED',
  forcedMethods: 'SNAPPPAY_FORCED_METHODS',
  commissionType: 'SNAPPPAY_COMMISSION_TYPE',
} as const;

export const SNAPPPAY_DEFAULT_COMMISSION_TYPE = 100;

export type SnappPaySettings = {
  enabled: boolean;
  forcedPaymentMethodTypes: SnappPayMethodType[];
  commissionType: number;
};

export type SnappPayCartItem = {
  id: number | string;
  name: string;
  category: string;
  count: number;
  /** Unit price, IRR */
  amount: number;
  commissionType: number;
};

export type SnappPayCart = {
  cartId: number | string;
  cartItems: SnappPayCartItem[];
  isShipmentIncluded: boolean;
  isTaxIncluded: boolean;
  shippingAmount: number;
  taxAmount: number;
  totalAmount: number;
};

export type SnappPayOrderPayload = {
  /** Total payable through Snapp Pay, IRR */
  amount: number;
  cartList: SnappPayCart[];
  discountAmount: number;
  externalSourceAmount: number;
};

export type SnappPayStatus =
  | 'SETTLE'
  | 'CANCEL'
  | 'VERIFY'
  | 'PENDING'
  | 'REVERT'
  | string;

const REQUEST_TIMEOUT_MS = 15_000;
// Snapp Pay docs: give verify a 30s timeout, then fall back to Get Payment Status.
const VERIFY_TIMEOUT_MS = 30_000;

@Injectable()
export class SnappPayService {
  private readonly logger = new Logger(SnappPayService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------- config

  isMockMode() {
    return (process.env.PAYMENT_MODE ?? 'mock').toLowerCase() === 'mock';
  }

  /** Which env vars are present — surfaced in the admin panel (never their values). */
  getConfigStatus() {
    const has = (k: string) => Boolean(process.env[k]?.trim());
    const baseUrl = this.baseUrl();
    return {
      mode: this.isMockMode() ? 'mock' : 'real',
      baseUrl,
      isStaging: /staging/i.test(baseUrl),
      credentials: {
        SNAPPPAY_BASE_URL: has('SNAPPPAY_BASE_URL'),
        SNAPPPAY_CLIENT_ID: has('SNAPPPAY_CLIENT_ID'),
        SNAPPPAY_CLIENT_SECRET: has('SNAPPPAY_CLIENT_SECRET'),
        SNAPPPAY_USERNAME: has('SNAPPPAY_USERNAME'),
        SNAPPPAY_PASSWORD: has('SNAPPPAY_PASSWORD'),
      },
      callbackUrl: `${process.env.BACKEND_URL ?? 'http://localhost:3005'}/payments/snapppay/callback`,
    };
  }

  isConfigured() {
    const c = this.getConfigStatus().credentials;
    return (
      c.SNAPPPAY_BASE_URL &&
      c.SNAPPPAY_CLIENT_ID &&
      c.SNAPPPAY_CLIENT_SECRET &&
      c.SNAPPPAY_USERNAME &&
      c.SNAPPPAY_PASSWORD
    );
  }

  private baseUrl() {
    return (
      process.env.SNAPPPAY_BASE_URL?.trim().replace(/\/+$/, '') ||
      'https://fms-gateway-staging.apps.public.okd4.teh-1.snappcloud.io'
    );
  }

  async getSettings(): Promise<SnappPaySettings> {
    const rows = await this.prisma.siteSetting.findMany({
      where: { key: { in: Object.values(SNAPPPAY_SETTING_KEYS) } },
      select: { key: true, value: true },
    });
    const map = new Map(rows.map((r) => [r.key, r.value]));

    let forced: SnappPayMethodType[] = [];
    try {
      const parsed = JSON.parse(map.get(SNAPPPAY_SETTING_KEYS.forcedMethods) ?? '[]');
      if (Array.isArray(parsed)) {
        forced = parsed
          .map((x) => String(x).toUpperCase())
          .filter((x): x is SnappPayMethodType =>
            (SNAPPPAY_METHOD_TYPES as string[]).includes(x),
          );
      }
    } catch {
      // keep []
    }

    const commission = Number(map.get(SNAPPPAY_SETTING_KEYS.commissionType));
    return {
      enabled: map.get(SNAPPPAY_SETTING_KEYS.enabled) === 'true',
      forcedPaymentMethodTypes: Array.from(new Set(forced)),
      commissionType:
        Number.isInteger(commission) && commission > 0
          ? commission
          : SNAPPPAY_DEFAULT_COMMISSION_TYPE,
    };
  }

  async saveSettings(next: SnappPaySettings): Promise<SnappPaySettings> {
    const upsert = (key: string, value: string) =>
      this.prisma.siteSetting.upsert({
        where: { key },
        create: { key, value },
        update: { value },
      });
    await this.prisma.$transaction([
      upsert(SNAPPPAY_SETTING_KEYS.enabled, String(next.enabled)),
      upsert(
        SNAPPPAY_SETTING_KEYS.forcedMethods,
        JSON.stringify(next.forcedPaymentMethodTypes),
      ),
      upsert(SNAPPPAY_SETTING_KEYS.commissionType, String(next.commissionType)),
    ]);
    return this.getSettings();
  }

  // ------------------------------------------------------------------ http

  /**
   * Snapp Pay access tokens live ~1h and the docs say to fetch a fresh one
   * when needed rather than hold a stale one — checkout volume is low enough
   * that we simply request one per call and never cache it.
   */
  private async fetchAccessToken(): Promise<string> {
    const clientId = process.env.SNAPPPAY_CLIENT_ID?.trim();
    const clientSecret = process.env.SNAPPPAY_CLIENT_SECRET?.trim();
    const username = process.env.SNAPPPAY_USERNAME?.trim();
    const password = process.env.SNAPPPAY_PASSWORD?.trim();
    if (!clientId || !clientSecret || !username || !password) {
      throw new BadRequestException('اطلاعات اتصال اسنپ‌پی روی سرور تنظیم نشده است');
    }

    const body = new URLSearchParams({
      grant_type: 'password',
      scope: 'online-merchant',
      username,
      password,
    });
    const res = await this.timedFetch(`${this.baseUrl()}/api/online/v1/oauth/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });
    const json: any = await res.json().catch(() => null);
    const token = json?.access_token;
    if (!res.ok || !token) {
      this.logger.error(`Snapp Pay auth failed (${res.status}): ${JSON.stringify(json)}`);
      throw new BadRequestException(
        this.describeAuthFailure(res.status, json) ?? 'احراز هویت اسنپ‌پی ناموفق بود',
      );
    }
    return String(token);
  }

  private describeAuthFailure(status: number, json: any): string | null {
    if (status === 403 || /access denied/i.test(JSON.stringify(json ?? ''))) {
      return 'Access Denied — احتمالاً IP سرور در اسنپ‌پی وایت‌لیست نشده است';
    }
    if (status === 401) {
      return 'Unauthorized — Client ID/Secret یا نام‌کاربری/رمز اسنپ‌پی اشتباه است';
    }
    return null;
  }

  private async timedFetch(
    url: string,
    init: RequestInit,
    timeoutMs = REQUEST_TIMEOUT_MS,
  ) {
    return fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  }

  private async call<T = any>(
    method: 'GET' | 'POST',
    path: string,
    opts: { body?: unknown; query?: Record<string, string>; timeoutMs?: number } = {},
  ): Promise<T> {
    const token = await this.fetchAccessToken();
    const qs = opts.query ? `?${new URLSearchParams(opts.query).toString()}` : '';
    const res = await this.timedFetch(
      `${this.baseUrl()}${path}${qs}`,
      {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: opts.body ? JSON.stringify(opts.body) : undefined,
      },
      opts.timeoutMs,
    );
    const json: any = await res.json().catch(() => null);
    if (!res.ok || json?.successful === false) {
      const message =
        json?.errorData?.message ||
        json?.message ||
        `Snapp Pay request failed (${res.status})`;
      this.logger.warn(`Snapp Pay ${path} -> ${res.status}: ${JSON.stringify(json)}`);
      throw new SnappPayApiError(String(message), json?.errorData?.errorCode ?? res.status);
    }
    return json?.response as T;
  }

  // ------------------------------------------------------------------- api

  /** Proves credentials + IP whitelist work — used by the admin "test connection" button. */
  async testConnection() {
    if (this.isMockMode()) return { ok: true, mock: true };
    await this.fetchAccessToken();
    return { ok: true, mock: false };
  }

  async checkEligibility(params: {
    amountRial: number;
    paymentMethodTypes?: SnappPayMethodType[];
  }): Promise<{ eligible: boolean; title_message?: string; description?: string }> {
    if (this.isMockMode()) {
      const eligible = params.amountRial >= 400_000 && params.amountRial <= 100_000_000;
      return {
        eligible,
        title_message: 'پرداخت اقساطی با اسنپ‌پی (تست)',
        description: 'حالت تست — پرداخت واقعی انجام نمی‌شود',
      };
    }
    const query: Record<string, string> = { amount: String(params.amountRial) };
    if (params.paymentMethodTypes?.length) {
      query.paymentMethodTypes = params.paymentMethodTypes.join(',');
    }
    return this.call('GET', '/api/online/offer/v1/eligible', { query });
  }

  async requestPaymentToken(params: {
    payload: SnappPayOrderPayload;
    mobile: string;
    returnURL: string;
    transactionId: string;
    forcedPaymentMethodTypes?: SnappPayMethodType[];
  }): Promise<{ paymentToken: string; paymentPageUrl: string | null; isMock: boolean }> {
    if (this.isMockMode()) {
      return {
        paymentToken: `MOCK-SNAPP-${params.transactionId}`,
        paymentPageUrl: null,
        isMock: true,
      };
    }
    const res = await this.call<{ paymentToken: string; paymentPageUrl: string }>(
      'POST',
      '/api/online/payment/v1/token',
      {
        body: {
          ...params.payload,
          mobile: params.mobile,
          returnURL: params.returnURL,
          transactionId: params.transactionId,
          ...(params.forcedPaymentMethodTypes?.length
            ? { forcedPaymentMethodTypes: params.forcedPaymentMethodTypes }
            : {}),
        },
      },
    );
    if (!res?.paymentToken || !res?.paymentPageUrl) {
      throw new BadRequestException('پاسخ نامعتبر از اسنپ‌پی');
    }
    return { ...res, isMock: false };
  }

  async verify(paymentToken: string): Promise<void> {
    if (this.isMockMode()) return;
    await this.call('POST', '/api/online/payment/v1/verify', {
      body: { paymentToken },
      timeoutMs: VERIFY_TIMEOUT_MS,
    });
  }

  async settle(paymentToken: string): Promise<void> {
    if (this.isMockMode()) return;
    await this.call('POST', '/api/online/payment/v1/settle', { body: { paymentToken } });
  }

  async getStatus(paymentToken: string): Promise<{
    transactionId: string;
    status: SnappPayStatus;
    amount?: number;
  }> {
    if (this.isMockMode()) {
      return { transactionId: paymentToken, status: 'SETTLE' };
    }
    return this.call('GET', '/api/online/payment/v1/status', {
      query: { paymentToken },
    });
  }

  async cancel(paymentToken: string): Promise<void> {
    if (this.isMockMode()) return;
    await this.call('POST', '/api/online/payment/v1/cancel', { body: { paymentToken } });
  }

  async update(paymentToken: string, payload: SnappPayOrderPayload): Promise<void> {
    if (this.isMockMode()) return;
    await this.call('POST', '/api/online/payment/v1/update', {
      body: { ...payload, paymentToken },
    });
  }

  /**
   * Verify -> settle with the recovery rules from the Snapp Pay docs:
   *  - verify timeout / no answer: ask Get Payment Status — VERIFY => go on to
   *    settle, PENDING => verify again, anything else => failed.
   *  - settle failure / no answer: ask status — VERIFY => settle again,
   *    SETTLE => done.
   * Throws if the purchase cannot be finalised; returns normally only when
   * Snapp reports SETTLE.
   */
  async verifyAndSettle(paymentToken: string): Promise<void> {
    if (this.isMockMode()) return;

    let verified = false;
    for (let attempt = 0; attempt < 3 && !verified; attempt++) {
      try {
        await this.verify(paymentToken);
        verified = true;
        break;
      } catch (err) {
        const status = await this.getStatus(paymentToken).catch(() => null);
        if (status?.status === 'VERIFY' || status?.status === 'SETTLE') {
          verified = true;
        } else if (status?.status !== 'PENDING') {
          throw err;
        }
      }
    }
    if (!verified) {
      throw new BadRequestException('تأیید (verify) اسنپ‌پی کامل نشد');
    }

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await this.settle(paymentToken);
        return;
      } catch (err) {
        const status = await this.getStatus(paymentToken).catch(() => null);
        if (status?.status === 'SETTLE') return;
        if (status?.status !== 'VERIFY' && attempt === 2) throw err;
      }
    }
    throw new BadRequestException('تسویه (settle) اسنپ‌پی کامل نشد');
  }

  // --------------------------------------------------------------- helpers

  /** 9-digit numeric id: docs require 5–10 digits, unique per purchase. */
  async generateTransactionId(): Promise<string> {
    for (let i = 0; i < 10; i++) {
      const candidate = String(randomInt(100_000_000, 999_999_999));
      const exists = await this.prisma.paymentTransaction.findUnique({
        where: { gatewayTransactionId: candidate },
        select: { id: true },
      });
      if (!exists) return candidate;
    }
    throw new BadRequestException('امکان ساخت شناسهٔ تراکنش نبود، دوباره تلاش کنید');
  }

  /**
   * Builds the cart block Snapp Pay expects from an order.
   *
   * Order of magnitude rules from the docs:
   *   cart total   = Σ(count × item amount) + shipping (when not included)
   *   order amount = Σ cart totals − discountAmount − externalSourceAmount
   *
   * Divine stores Toman; Snapp Pay wants IRR, so everything is ×10. Packaging is
   * folded into shippingAmount, the wallet portion is the "external source".
   */
  buildOrderPayload(
    order: {
      id: string;
      orderCode: string;
      totalAmount: unknown;
      discountAmount: unknown;
      shippingCost: unknown;
      packagingCost: unknown;
      payableAmount: unknown;
      items: Array<{
        id: string;
        title: string;
        quantity: number;
        unitPrice: unknown;
        unitDiscountPrice: unknown;
        categoryTitle?: string | null;
      }>;
    },
    commissionType: number,
  ): SnappPayOrderPayload {
    const rial = (toman: unknown) => Math.round(Number(toman) * 10);

    // Item ids must stay identical between token and update calls, so derive
    // them from the order item uuid instead of the item's position.
    const stableId = (uuid: string) =>
      parseInt(uuid.replace(/-/g, '').slice(0, 8), 16);

    const cartItems: SnappPayCartItem[] = order.items.map((it) => ({
      id: stableId(it.id),
      name: it.title,
      category: it.categoryTitle?.trim() || 'پوشاک',
      count: it.quantity,
      amount: rial(it.unitDiscountPrice ?? it.unitPrice),
      commissionType,
    }));
    const itemsTotal = cartItems.reduce((s, it) => s + it.count * it.amount, 0);
    const shippingAmount = rial(Number(order.shippingCost) + Number(order.packagingCost));
    const cartTotal = itemsTotal + shippingAmount;

    const discountAmount = rial(order.discountAmount);
    // Wallet money applied at checkout isn't stored on the order; it is exactly
    // what is left between the gross total and what the customer still owes.
    const externalSourceAmount = Math.max(
      0,
      cartTotal - discountAmount - rial(order.payableAmount),
    );
    const amount = cartTotal - discountAmount - externalSourceAmount;

    if (amount <= 0) {
      throw new BadRequestException('مبلغ پرداخت اقساطی نامعتبر است');
    }

    return {
      amount,
      discountAmount,
      externalSourceAmount,
      cartList: [
        {
          cartId: Number(order.orderCode.replace(/\D/g, '').slice(-9)) || 1,
          cartItems,
          isShipmentIncluded: false,
          isTaxIncluded: true,
          shippingAmount,
          taxAmount: 0,
          totalAmount: cartTotal,
        },
      ],
    };
  }
}

export class SnappPayApiError extends BadRequestException {
  constructor(
    message: string,
    public readonly errorCode: number | string,
  ) {
    super(message);
  }
}
