import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { CreateCollectionCommand } from '../create-collection.command';
import { ICollectionRepository } from '../../../domain/repositories/collection.repository.interface';
import { Inject } from '@nestjs/common';
import slugify from 'slugify';

@CommandHandler(CreateCollectionCommand)
export class CreateCollectionHandler
  implements ICommandHandler<CreateCollectionCommand>
{
  constructor(
    @Inject('ICollectionRepository')
    private readonly repository: ICollectionRepository,
  ) {}

  async execute(command: CreateCollectionCommand) {
    const { dto } = command;
    const slug = slugify(dto.title, { lower: true });
    return this.repository.create({ ...dto, slug });
  }
}
