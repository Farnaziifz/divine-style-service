import { Product } from '@prisma/client';
import { CreateProductDto } from '../../presentation/dtos/create-product.dto';
import { ProductFilterDto } from '../../presentation/dtos/product-filter.dto';

import { PaginatedResult } from '../../../shared/interfaces/paginated-result.interface';

export interface IProductRepository {
  create(
    data: CreateProductDto & { slug: string; images: string[] },
  ): Promise<Product>;
  findAll(filter?: ProductFilterDto): Promise<PaginatedResult<Product>>;
  findById(id: string): Promise<Product | null>;
  findBySlug(slug: string): Promise<Product | null>;
  update(id: string, data: any): Promise<Product>;
  remove(id: string): Promise<Product>;
}
