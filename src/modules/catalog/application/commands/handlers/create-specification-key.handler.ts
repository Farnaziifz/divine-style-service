import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { CreateSpecificationKeyCommand } from '../create-specification-key.command';
import { ISpecificationRepository } from '../../../domain/repositories/specification.repository.interface';
import { Inject } from '@nestjs/common';

@CommandHandler(CreateSpecificationKeyCommand)
export class CreateSpecificationKeyHandler
  implements ICommandHandler<CreateSpecificationKeyCommand>
{
  constructor(
    @Inject('ISpecificationRepository')
    private readonly repository: ISpecificationRepository,
  ) {}

  async execute(command: CreateSpecificationKeyCommand) {
    return this.repository.createKey(command.dto);
  }
}
