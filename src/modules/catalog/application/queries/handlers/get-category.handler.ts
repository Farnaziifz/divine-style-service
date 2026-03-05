import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { GetCategoryQuery } from '../get-category.query';
import { ICategoryRepository } from '../../../domain/repositories/category.repository.interface';
import { Inject, NotFoundException } from '@nestjs/common';

@QueryHandler(GetCategoryQuery)
export class GetCategoryHandler implements IQueryHandler<GetCategoryQuery> {
  constructor(
    @Inject('ICategoryRepository')
    private readonly repository: ICategoryRepository,
  ) {}

  async execute(query: GetCategoryQuery) {
    const { id } = query;
    const category = await this.repository.findById(id);
    if (!category) {
      throw new NotFoundException(`Category with ID ${id} not found`);
    }
    return category;
  }
}
