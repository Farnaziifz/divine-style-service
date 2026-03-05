import { UpdateProductDto } from '../../presentation/dtos/update-product.dto';

export class UpdateProductCommand {
  constructor(
    public readonly id: string,
    public readonly dto: UpdateProductDto,
    public readonly images?: string[],
  ) {}
}
