import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { UpdateSpecificationKeyCommand } from '../update-specification-key.command';
import { ISpecificationRepository } from '../../../domain/repositories/specification.repository.interface';

@CommandHandler(UpdateSpecificationKeyCommand)
export class UpdateSpecificationKeyHandler
  implements ICommandHandler<UpdateSpecificationKeyCommand>
{
  constructor(
    @Inject('ISpecificationRepository')
    private readonly repository: ISpecificationRepository,
  ) {}

  async execute(command: UpdateSpecificationKeyCommand) {
    console.log('Handler: Execute', command);
    try {
      const res = await this.repository.updateKey(command.id, command.dto);
      console.log('Handler: Result', res);
      return res;
    } catch (e) {
      console.error('Handler: Error', e);
      throw e;
    }
  }
}
