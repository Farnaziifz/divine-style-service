import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { CreateCategoryCommand } from '../create-category.command';
import { ICategoryRepository } from '../../../domain/repositories/category.repository.interface';
import { Inject } from '@nestjs/common';
import slugify from 'slugify';

@CommandHandler(CreateCategoryCommand)
export class CreateCategoryHandler implements ICommandHandler<CreateCategoryCommand> {
  constructor(
    @Inject('ICategoryRepository')
    private readonly repository: ICategoryRepository,
  ) {}

  async execute(command: CreateCategoryCommand) {
    const { dto } = command;
    const slug = slugify(dto.title, { lower: true });
    return this.repository.create({ ...dto, slug });
  }
}
