import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { UpdateProductCommand } from '../update-product.command';
import { IProductRepository } from '../../../domain/repositories/product.repository.interface';
import { Inject, NotFoundException } from '@nestjs/common';
import slugify from 'slugify';

@CommandHandler(UpdateProductCommand)
export class UpdateProductHandler implements ICommandHandler<UpdateProductCommand> {
  constructor(
    @Inject('IProductRepository')
    private readonly repository: IProductRepository,
  ) {}

  async execute(command: UpdateProductCommand) {
    const { id, dto, images } = command;
    const product = await this.repository.findById(id);
    if (!product) {
      throw new NotFoundException(`Product with ID ${id} not found`);
    }

    const slug = dto.title ? slugify(dto.title, { lower: true }) : product.slug;

    const updateData: any = { ...dto, slug };
    if (images) {
      updateData.images = images;
    }

    return this.repository.update(id, updateData);
  }
}
