import { BadRequestException } from '@nestjs/common';
import { OrderAdminService } from './order-admin.service';

function makeService(order: any, items: any[]) {
  const state = { items: items.map((i) => ({ ...i })), order: { ...order }, stock: new Map<string, number>() };
  const tx: any = {
    order: {
      findFirst: jest.fn(async () => ({
        ...state.order,
        items: state.items.filter((i) => !i.isDeleted),
        incentiveRedemptions: [],
        referralRedemption: null,
      })),
      update: jest.fn(async ({ data }: any) => {
        state.order = { ...state.order, ...data };
      }),
    },
    orderItem: {
      findMany: jest.fn(async () => state.items.filter((i) => !i.isDeleted)),
      update: jest.fn(async ({ where, data }: any) => {
        const it = state.items.find((i) => i.id === where.id);
        Object.assign(it, data);
      }),
      updateMany: jest.fn(async () => ({ count: 0 })),
    },
    productVariant: {
      updateMany: jest.fn(async ({ where, data }: any) => {
        const cur = state.stock.get(where.id) ?? 0;
        if (data.stock.increment) state.stock.set(where.id, cur + data.stock.increment);
        else {
          if (cur < data.stock.decrement) return { count: 0 };
          state.stock.set(where.id, cur - data.stock.decrement);
        }
        return { count: 1 };
      }),
    },
    discountCode: { updateMany: jest.fn() },
  };
  const prisma: any = { $transaction: (fn: any) => fn(tx) };
  return { svc: new OrderAdminService(prisma), state };
}

const baseOrder = {
  id: 'o1',
  orderCode: 'DV-1',
  paymentStatus: 'PAID',
  totalAmount: 300,
  discountAmount: 50,
  shippingCost: 20,
  packagingCost: 10,
  // 300 - 50 + 20 + 10 = 280، که 30 آن از کیف پول → 250 درگاه
  payableAmount: 250,
};
const items = () => [
  { id: 'i1', productVariantId: 'v1', quantity: 2, unitPrice: 100, unitDiscountPrice: null, isDeleted: false },
  { id: 'i2', productVariantId: 'v2', quantity: 1, unitPrice: 150, unitDiscountPrice: 100, isDeleted: false },
];

describe('OrderAdminService', () => {
  it('recalculates totals when an item is deleted and returns stock', async () => {
    const { svc, state } = makeService(baseOrder, items());
    const res = await svc.deleteItem('DV-1', 'i1', true);
    // total = 100 (i2 با تخفیف)، تخفیف ثابت 50 → 100-50+20+10 = 80، سهم کیف پول 30 → 50
    expect(state.order.totalAmount).toBe(100);
    expect(state.order.payableAmount).toBe(50);
    expect(state.stock.get('v1')).toBe(2);
    expect(res.gatewayRefundDue).toBe(200);
    expect(res.walletRefundDue).toBe(0);
  });

  it('clamps discount to new total and shrinks wallet share, reporting wallet refund', async () => {
    const { svc, state } = makeService({ ...baseOrder, discountAmount: 0, payableAmount: 300 }, items());
    // total=300(2*100+100)... با حذف i1 total=100؛ remaining=100+30=130 ؛ wallet قبلی=300+30-300=30
    const res = await svc.deleteItem('DV-1', 'i1', false);
    expect(state.order.totalAmount).toBe(100);
    expect(state.order.payableAmount).toBe(100);
    expect(state.stock.get('v1')).toBeUndefined();
    expect(res.current.walletApplied).toBe(30);
  });

  it('increasing quantity with returnToStock decrements stock and fails when short', async () => {
    const { svc } = makeService(baseOrder, items());
    await expect(svc.updateItem('DV-1', 'i2', { quantity: 3, returnToStock: true })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects editing a pending-payment order and deleting the last item', async () => {
    const pending = makeService({ ...baseOrder, paymentStatus: 'PENDING' }, items());
    await expect(pending.svc.updateOrder('DV-1', { shippingCost: 0 })).rejects.toBeInstanceOf(BadRequestException);

    const single = makeService(baseOrder, [items()[0]]);
    await expect(single.svc.deleteItem('DV-1', 'i1', false)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('does not touch stock for a FAILED (already released) order on delete', async () => {
    const { svc, state } = makeService({ ...baseOrder, paymentStatus: 'FAILED' }, items());
    const res = await svc.deleteOrder('DV-1', true);
    expect(state.stock.size).toBe(0);
    expect(res.gatewayRefundDue).toBe(0);
  });
});
