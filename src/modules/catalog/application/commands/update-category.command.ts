import { UpdateCategoryDto } from '../../presentation/dtos/update-category.dto';

export class UpdateCategoryCommand {
  constructor(
    public readonly id: string,
    public readonly dto: UpdateCategoryDto,
  ) {}
}
