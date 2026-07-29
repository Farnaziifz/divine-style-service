import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { GetProductQuery } from '../get-product.query';
import { IProductRepository } from '../../../domain/repositories/product.repository.interface';
import { Inject, NotFoundException } from '@nestjs/common';

@QueryHandler(GetProductQuery)
export class GetProductHandler implements IQueryHandler<GetProductQuery> {
  constructor(
    @Inject('IProductRepository')
    private readonly repository: IProductRepository,
  ) {}

  async execute(query: GetProductQuery) {
    const { id, includeInactive } = query;
    const product = await this.repository.findById(id, includeInactive);
    if (!product) {
      throw new NotFoundException(`Product with ID ${id} not found`);
    }
    return product;
  }
}
