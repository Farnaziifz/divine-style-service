import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { GetCollectionQuery } from '../get-collection.query';
import { ICollectionRepository } from '../../../domain/repositories/collection.repository.interface';
import { Inject, NotFoundException } from '@nestjs/common';

@QueryHandler(GetCollectionQuery)
export class GetCollectionHandler implements IQueryHandler<GetCollectionQuery> {
  constructor(
    @Inject('ICollectionRepository')
    private readonly repository: ICollectionRepository,
  ) {}

  async execute(query: GetCollectionQuery) {
    const { id } = query;
    const collection = await this.repository.findById(id);
    if (!collection) {
      throw new NotFoundException(`Collection with ID ${id} not found`);
    }
    return collection;
  }
}
