import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { GetCategoriesQuery } from '../get-categories.query';
import { ICategoryRepository } from '../../../domain/repositories/category.repository.interface';
import { Inject } from '@nestjs/common';

@QueryHandler(GetCategoriesQuery)
export class GetCategoriesHandler implements IQueryHandler<GetCategoriesQuery> {
  constructor(
    @Inject('ICategoryRepository')
    private readonly repository: ICategoryRepository,
  ) {}

  async execute(query: GetCategoriesQuery) {
    return this.repository.findAll();
  }
}
