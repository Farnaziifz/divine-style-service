import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { UpdateCollectionCommand } from '../update-collection.command';
import { ICollectionRepository } from '../../../domain/repositories/collection.repository.interface';
import { Inject, NotFoundException } from '@nestjs/common';
import slugify from 'slugify';

@CommandHandler(UpdateCollectionCommand)
export class UpdateCollectionHandler
  implements ICommandHandler<UpdateCollectionCommand>
{
  constructor(
    @Inject('ICollectionRepository')
    private readonly repository: ICollectionRepository,
  ) {}

  async execute(command: UpdateCollectionCommand) {
    const { id, dto } = command;
    const collection = await this.repository.findById(id);
    if (!collection) {
      throw new NotFoundException(`Collection with ID ${id} not found`);
    }

    const slug = dto.title
      ? slugify(dto.title, { lower: true })
      : collection.slug;
    return this.repository.update(id, { ...dto, slug });
  }
}
