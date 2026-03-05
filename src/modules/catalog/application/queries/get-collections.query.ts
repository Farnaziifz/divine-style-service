import { PaginationDto } from '../../../shared/dtos/pagination.dto';

export class GetCollectionsQuery {
  constructor(public readonly pagination?: PaginationDto) {}
}
