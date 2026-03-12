import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { DeleteCategoryCommand } from '../delete-category.command';
import { ICategoryRepository } from '../../../domain/repositories/category.repository.interface';
import { Inject, NotFoundException } from '@nestjs/common';

@CommandHandler(DeleteCategoryCommand)
export class DeleteCategoryHandler implements ICommandHandler<DeleteCategoryCommand> {
  constructor(
    @Inject('ICategoryRepository')
    private readonly repository: ICategoryRepository,
  ) {}

  async execute(command: DeleteCategoryCommand) {
    const { id } = command;
    const category = await this.repository.findById(id);
    if (!category) {
      throw new NotFoundException(`Category with ID ${id} not found`);
    }
    return this.repository.remove(id);
  }
}
