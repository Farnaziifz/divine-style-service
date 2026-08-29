import { Product } from '@prisma/client';
import { CreateProductDto } from '../../presentation/dtos/create-product.dto';
import { ProductFilterDto } from '../../presentation/dtos/product-filter.dto';

import { PaginatedResult } from '../../../shared/interfaces/paginated-result.interface';

export interface IProductRepository {
  create(
    data: CreateProductDto & {
      slug: string;
      images: string[];
      code: number;
      finalPrice: number;
    },
  ): Promise<Product>;
  findAll(
    filter?: ProductFilterDto,
    includeInactive?: boolean,
  ): Promise<PaginatedResult<Product>>;
  findById(id: string, includeInactive?: boolean): Promise<Product | null>;
  findBySlug(slug: string, includeInactive?: boolean): Promise<Product | null>;
  update(id: string, data: any): Promise<Product>;
  remove(id: string): Promise<Product>;
  /** تعداد محصولات فعال با showInRack=true در یک دسته‌بندی؛ برای اعمال سقف ۷ آیتم رگال */
  countRackItems(categoryId: string, excludeProductId?: string): Promise<number>;
}
