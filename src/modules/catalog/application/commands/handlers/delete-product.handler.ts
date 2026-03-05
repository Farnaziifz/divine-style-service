import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { DeleteProductCommand } from '../delete-product.command';
import { IProductRepository } from '../../../domain/repositories/product.repository.interface';
import { Inject, NotFoundException } from '@nestjs/common';

@CommandHandler(DeleteProductCommand)
export class DeleteProductHandler
  implements ICommandHandler<DeleteProductCommand>
{
  constructor(
    @Inject('IProductRepository')
    private readonly repository: IProductRepository,
  ) {}

  async execute(command: DeleteProductCommand) {
    const { id } = command;
    const product = await this.repository.findById(id);
    if (!product) {
      throw new NotFoundException(`Product with ID ${id} not found`);
    }
    return this.repository.remove(id);
  }
}
