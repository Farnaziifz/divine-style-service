import { ProductFilterDto } from '../../presentation/dtos/product-filter.dto';

export class GetProductsQuery {
  constructor(public readonly filter?: ProductFilterDto) {}
}
