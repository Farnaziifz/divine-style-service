import { Category } from '@prisma/client';
import { CreateCategoryDto } from '../../presentation/dtos/create-category.dto';
import { UpdateCategoryDto } from '../../presentation/dtos/update-category.dto';

export interface ICategoryRepository {
  create(data: CreateCategoryDto & { slug: string }): Promise<Category>;
  findAll(): Promise<Category[]>;
  findById(id: string): Promise<Category | null>;
  update(
    id: string,
    data: UpdateCategoryDto & { slug: string },
  ): Promise<Category>;
  remove(id: string): Promise<Category>;
}
