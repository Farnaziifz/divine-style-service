import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { UpdateCategoryCommand } from '../update-category.command';
import { ICategoryRepository } from '../../../domain/repositories/category.repository.interface';
import { Inject, NotFoundException } from '@nestjs/common';
import slugify from 'slugify';

@CommandHandler(UpdateCategoryCommand)
export class UpdateCategoryHandler implements ICommandHandler<UpdateCategoryCommand> {
  constructor(
    @Inject('ICategoryRepository')
    private readonly repository: ICategoryRepository,
  ) {}

  async execute(command: UpdateCategoryCommand) {
    const { id, dto } = command;
    const category = await this.repository.findById(id);
    if (!category) {
      throw new NotFoundException(`Category with ID ${id} not found`);
    }

    const slug = dto.title
      ? slugify(dto.title, { lower: true })
      : category.slug;
    return this.repository.update(id, { ...dto, slug });
  }
}
