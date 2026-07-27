import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { CreateProductCommand } from '../create-product.command';
import { IProductRepository } from '../../../domain/repositories/product.repository.interface';
import { ICategoryRepository } from '../../../domain/repositories/category.repository.interface';
import { PricingService } from '../../services/pricing.service';
import { Inject, NotFoundException } from '@nestjs/common';
import slugify from 'slugify';

@CommandHandler(CreateProductCommand)
export class CreateProductHandler implements ICommandHandler<CreateProductCommand> {
  constructor(
    @Inject('IProductRepository')
    private readonly repository: IProductRepository,
    @Inject('ICategoryRepository')
    private readonly categoryRepository: ICategoryRepository,
    private readonly pricingService: PricingService,
  ) {}

  async execute(command: CreateProductCommand) {
    const { dto, images } = command;
    const category = await this.categoryRepository.findById(dto.categoryId);
    if (!category) {
      throw new NotFoundException('دسته‌بندی یافت نشد');
    }

    const code = await this.categoryRepository.allocateNextProductCode(
      dto.categoryId,
    );
    const finalPrice = await this.pricingService.computeFinalPrice(
      dto.costPrice,
      Number(category.profitMultiplier),
    );
    const slug = slugify(dto.title, { lower: true });
    return this.repository.create({
      ...dto,
      slug,
      images,
      code,
      finalPrice,
    });
  }
}
