import { CreateCategoryDto } from '../../presentation/dtos/create-category.dto';

export class CreateCategoryCommand {
  constructor(public readonly dto: CreateCategoryDto) {}
}
