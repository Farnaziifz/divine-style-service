import { Injectable } from '@nestjs/common';
import { PrismaService } from '../shared/prisma/prisma.service';
import { TorobApiException } from './torob-api.exception';
import { TorobProductsRequestDto, TorobSort } from './dto/torob-products-request.dto';

const PAGE_SIZE = 100;
const DEFAULT_LANG = 'fa';

interface TorobProduct {
  page_unique: string;
  page_url: string;
  title: string;
  current_price: number;
  old_price?: number;
  availability: boolean;
  category_name?: string;
  image_links: string[];
  short_desc?: string;
  spec: Record<string, string | number>;
  guarantee?: string;
  date_added: string;
  date_updated: string;
}

export interface TorobProductsResponse {
  api_version: 'torob_api_v3';
  current_page: number;
  total: number;
  max_pages: number;
  products: TorobProduct[];
}

const PRODUCT_SELECT = {
  id: true,
  title: true,
  description: true,
  images: true,
  finalPrice: true,
  discountPrice: true,
  specifications: true,
  guarantee: true,
  createdAt: true,
  updatedAt: true,
  category: { select: { title: true } },
  variants: { select: { stock: true } },
} as const;

type SelectedProduct = {
  id: string;
  title: string;
  description: string;
  images: string[];
  finalPrice: unknown;
  discountPrice: unknown;
  specifications: unknown;
  guarantee: string | null;
  createdAt: Date;
  updatedAt: Date;
  category: { title: string } | null;
  variants: { stock: number }[];
};

@Injectable()
export class TorobFeedService {
  constructor(private readonly prisma: PrismaService) {}

  private get baseUrl(): string {
    return (process.env.FRONTEND_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
  }

  private buildPageUrl(productId: string): string {
    return `${this.baseUrl}/${DEFAULT_LANG}/product/${productId}`;
  }

  private extractIdFromUrl(url: string): string | null {
    const match = url.match(/\/product\/([^/?#]+)/);
    return match ? match[1] : null;
  }

  private mapProduct(product: SelectedProduct): TorobProduct {
    const stock = product.variants.reduce((sum, v) => sum + (v.stock ?? 0), 0);
    const availability = stock > 0;

    const finalPrice = Math.round(Number(product.finalPrice));
    const discountPrice =
      product.discountPrice != null ? Math.round(Number(product.discountPrice)) : null;

    const spec: Record<string, string | number> = {};
    if (product.specifications && typeof product.specifications === 'object') {
      for (const [key, value] of Object.entries(product.specifications as Record<string, unknown>)) {
        if (typeof value === 'string' || typeof value === 'number') {
          spec[key] = value;
        }
      }
    }

    return {
      page_unique: product.id,
      page_url: this.buildPageUrl(product.id),
      title: product.title,
      current_price: discountPrice ?? finalPrice,
      ...(discountPrice != null ? { old_price: finalPrice } : {}),
      availability,
      ...(product.category?.title ? { category_name: product.category.title } : {}),
      image_links: product.images ?? [],
      ...(product.description ? { short_desc: product.description.slice(0, 500) } : {}),
      spec,
      ...(product.guarantee ? { guarantee: product.guarantee } : {}),
      date_added: product.createdAt.toISOString(),
      date_updated: product.updatedAt.toISOString(),
    };
  }

  async handleRequest(dto: TorobProductsRequestDto): Promise<TorobProductsResponse> {
    const hasUrls = Array.isArray(dto.page_urls) && dto.page_urls.length > 0;
    const hasUniques = Array.isArray(dto.page_uniques) && dto.page_uniques.length > 0;
    const hasPaging = dto.page !== undefined || dto.sort !== undefined;

    const modesProvided = [hasUrls, hasUniques, hasPaging].filter(Boolean).length;
    if (modesProvided === 0) {
      throw new TorobApiException(
        'exactly one of page_urls, page_uniques, or page+sort must be provided',
      );
    }
    if (modesProvided > 1) {
      throw new TorobApiException(
        'only one of page_urls, page_uniques, or page+sort may be provided at a time',
      );
    }

    if (hasUrls) {
      return this.handleByIds(dto.page_urls!.map((u) => this.extractIdFromUrl(u)).filter((id): id is string => !!id));
    }
    if (hasUniques) {
      return this.handleByIds(dto.page_uniques!);
    }
    return this.handleByPage(dto.page, dto.sort);
  }

  private async handleByIds(ids: string[]): Promise<TorobProductsResponse> {
    const uniqueIds = [...new Set(ids)];
    const products = uniqueIds.length
      ? await this.prisma.product.findMany({
          where: { id: { in: uniqueIds }, isDeleted: false, isActive: true },
          select: PRODUCT_SELECT,
        })
      : [];

    const mapped = products.map((p) => this.mapProduct(p));
    return {
      api_version: 'torob_api_v3',
      current_page: 1,
      total: mapped.length,
      max_pages: 1,
      products: mapped,
    };
  }

  private async handleByPage(page: number | undefined, sort: TorobSort | undefined): Promise<TorobProductsResponse> {
    if (!sort) {
      throw new TorobApiException('sort parameter is not provided');
    }
    if (!page || page < 1) {
      throw new TorobApiException('page parameter is not provided');
    }

    const orderBy =
      sort === 'date_added_desc' ? { createdAt: 'desc' as const } : { updatedAt: 'desc' as const };
    const where = { isDeleted: false, isActive: true };

    const [products, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        select: PRODUCT_SELECT,
        orderBy,
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
      this.prisma.product.count({ where }),
    ]);

    return {
      api_version: 'torob_api_v3',
      current_page: page,
      total,
      max_pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
      products: products.map((p) => this.mapProduct(p)),
    };
  }
}
