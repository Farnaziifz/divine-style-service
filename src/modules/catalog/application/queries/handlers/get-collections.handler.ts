import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { GetCollectionsQuery } from '../get-collections.query';
import { ICollectionRepository } from '../../../domain/repositories/collection.repository.interface';
import { Inject } from '@nestjs/common';

@QueryHandler(GetCollectionsQuery)
export class GetCollectionsHandler implements IQueryHandler<GetCollectionsQuery> {
  constructor(
    @Inject('ICollectionRepository')
    private readonly repository: ICollectionRepository,
  ) {}

  async execute(query: GetCollectionsQuery) {
    return this.repository.findAll(query.pagination);
  }
}
