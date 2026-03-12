import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { DeleteCollectionCommand } from '../delete-collection.command';
import { ICollectionRepository } from '../../../domain/repositories/collection.repository.interface';
import { Inject, NotFoundException } from '@nestjs/common';

@CommandHandler(DeleteCollectionCommand)
export class DeleteCollectionHandler implements ICommandHandler<DeleteCollectionCommand> {
  constructor(
    @Inject('ICollectionRepository')
    private readonly repository: ICollectionRepository,
  ) {}

  async execute(command: DeleteCollectionCommand) {
    const { id } = command;
    const collection = await this.repository.findById(id);
    if (!collection) {
      throw new NotFoundException(`Collection with ID ${id} not found`);
    }
    return this.repository.remove(id);
  }
}
