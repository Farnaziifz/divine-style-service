import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { DeleteSpecificationKeyCommand } from '../delete-specification-key.command';
import { ISpecificationRepository } from '../../../domain/repositories/specification.repository.interface';

@CommandHandler(DeleteSpecificationKeyCommand)
export class DeleteSpecificationKeyHandler implements ICommandHandler<DeleteSpecificationKeyCommand> {
  constructor(
    @Inject('ISpecificationRepository')
    private readonly repository: ISpecificationRepository,
  ) {}

  async execute(command: DeleteSpecificationKeyCommand) {
    return this.repository.deleteKey(command.id);
  }
}
