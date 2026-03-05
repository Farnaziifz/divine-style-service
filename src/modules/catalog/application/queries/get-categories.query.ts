import { PaginationDto } from '../../../shared/dtos/pagination.dto';

export class GetCategoriesQuery {
  constructor(public readonly pagination?: PaginationDto) {}
}
