import { CreateProductDto } from '../../presentation/dtos/create-product.dto';

export class CreateProductCommand {
  constructor(
    public readonly dto: CreateProductDto,
    public readonly images: string[],
  ) {}
}
