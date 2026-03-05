import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { CreateProductCommand } from '../create-product.command';
import { IProductRepository } from '../../../domain/repositories/product.repository.interface';
import { Inject } from '@nestjs/common';
import slugify from 'slugify';

@CommandHandler(CreateProductCommand)
export class CreateProductHandler
  implements ICommandHandler<CreateProductCommand>
{
  constructor(
    @Inject('IProductRepository')
    private readonly repository: IProductRepository,
  ) {}

  async execute(command: CreateProductCommand) {
    const { dto, images } = command;
    const slug = slugify(dto.title, { lower: true });
    return this.repository.create({ ...dto, slug, images });
  }
}
