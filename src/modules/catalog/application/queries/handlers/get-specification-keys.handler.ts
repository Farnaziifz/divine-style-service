import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { GetSpecificationKeysQuery } from '../get-specification-keys.query';
import { ISpecificationRepository } from '../../../domain/repositories/specification.repository.interface';
import { Inject } from '@nestjs/common';

@QueryHandler(GetSpecificationKeysQuery)
export class GetSpecificationKeysHandler implements IQueryHandler<GetSpecificationKeysQuery> {
  constructor(
    @Inject('ISpecificationRepository')
    private readonly repository: ISpecificationRepository,
  ) {}

  async execute() {
    return this.repository.findAllKeys();
  }
}
