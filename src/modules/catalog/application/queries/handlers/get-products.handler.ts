import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { GetProductsQuery } from '../get-products.query';
import { IProductRepository } from '../../../domain/repositories/product.repository.interface';
import { Inject } from '@nestjs/common';

@QueryHandler(GetProductsQuery)
export class GetProductsHandler implements IQueryHandler<GetProductsQuery> {
  constructor(
    @Inject('IProductRepository')
    private readonly repository: IProductRepository,
  ) {}

  async execute(query: GetProductsQuery) {
    return this.repository.findAll(query.filter);
  }
}
