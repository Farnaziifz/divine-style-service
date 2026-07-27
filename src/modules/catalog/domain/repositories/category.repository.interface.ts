import { Category } from '@prisma/client';
import { CreateCategoryDto } from '../../presentation/dtos/create-category.dto';
import { UpdateCategoryDto } from '../../presentation/dtos/update-category.dto';
import { PaginationDto } from '../../../shared/dtos/pagination.dto';
import { PaginatedResult } from '../../../shared/interfaces/paginated-result.interface';

export interface ICategoryRepository {
  create(data: CreateCategoryDto & { slug: string }): Promise<Category>;
  findAll(pagination?: PaginationDto): Promise<PaginatedResult<Category>>;
  findById(id: string): Promise<Category | null>;
  update(
    id: string,
    data: UpdateCategoryDto & { slug: string; nextCode?: number },
  ): Promise<Category>;
  remove(id: string): Promise<Category>;
  /** تخصیص اتمیک کد بعدی محصول در این دسته‌بندی (nextCode را یکی افزایش می‌دهد و مقدار قبلی را برمی‌گرداند) */
  allocateNextProductCode(categoryId: string): Promise<number>;
  /** تعداد محصولات (غیرحذف‌شده) این دسته‌بندی — برای تصمیم دربارهٔ تغییرپذیری codeStart */
  countProducts(categoryId: string): Promise<number>;
}
