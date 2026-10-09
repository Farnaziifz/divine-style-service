import { Prisma } from '@prisma/client';
import { PrismaService } from '../shared/prisma/prisma.service';

/**
 * تعداد خریدهای قبلی مشتری برای پلهٔ تخفیف خوش‌آمدگویی:
 * سفارش‌های PAID سایت + فروش‌های حضوری/اینستایی که به حساب او وصل شده‌اند.
 */
export async function countWelcomeTierPurchases(
  client: PrismaService | Prisma.TransactionClient,
  userId: string,
): Promise<number> {
  const [orders, offlineSales] = await Promise.all([
    client.order.count({
      where: { userId, paymentStatus: 'PAID', isDeleted: false },
    }),
    client.offlineSale.count({
      where: { customerId: userId, isDeleted: false },
    }),
  ]);
  return orders + offlineSales;
}
