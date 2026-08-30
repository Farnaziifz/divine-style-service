import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { CreateProductCommand } from '../create-product.command';
import { IProductRepository } from '../../../domain/repositories/product.repository.interface';
import { ICategoryRepository } from '../../../domain/repositories/category.repository.interface';
import { PricingService } from '../../services/pricing.service';
import { ContentCalendarService } from '../../../../content-calendar/content-calendar.service';
import { BadRequestException, Inject, Logger, NotFoundException } from '@nestjs/common';
import slugify from 'slugify';

@CommandHandler(CreateProductCommand)
export class CreateProductHandler implements ICommandHandler<CreateProductCommand> {
  private readonly logger = new Logger(CreateProductHandler.name);

  constructor(
    @Inject('IProductRepository')
    private readonly repository: IProductRepository,
    @Inject('ICategoryRepository')
    private readonly categoryRepository: ICategoryRepository,
    private readonly pricingService: PricingService,
    private readonly contentCalendarService: ContentCalendarService,
  ) {}

  async execute(command: CreateProductCommand) {
    const { dto, images } = command;
    const category = await this.categoryRepository.findById(dto.categoryId);
    if (!category) {
      throw new NotFoundException('دسته‌بندی یافت نشد');
    }

    if (dto.showInRack) {
      const rackCount = await this.repository.countRackItems(dto.categoryId);
      if (rackCount >= 7) {
        throw new BadRequestException(
          'این دسته‌بندی از قبل ۷ محصول در رگال دارد؛ ابتدا یکی را از رگال خارج کنید.',
        );
      }
    }

    const code = await this.categoryRepository.allocateNextProductCode(
      dto.categoryId,
    );
    // ضریب سود مخصوص خود محصول است؛ اگر ادمین ندهد، ضریب دسته‌بندی به‌عنوان پیش‌فرض اولیه استفاده می‌شود
    const profitMultiplier =
      dto.profitMultiplier != null
        ? dto.profitMultiplier
        : Number(category.profitMultiplier);
    const finalPrice = await this.pricingService.computeFinalPrice(
      dto.costPrice,
      profitMultiplier,
    );
    // تخفیف دستی روی هزینه‌تمام‌شده+سود اعمال می‌شود (نه روی قیمت نهایی مالیات‌خورده)
    const discountPrice =
      dto.discountPercent != null && dto.discountPercent > 0
        ? this.pricingService.calculateDiscountedPrice(
            dto.costPrice,
            profitMultiplier,
            dto.discountPercent,
          )
        : undefined;
    const slug = slugify(dto.title, { lower: true });
    const product = await this.repository.create({
      ...dto,
      slug,
      images,
      code,
      profitMultiplier,
      finalPrice,
      ...(discountPrice != null ? { discountPrice } : {}),
    });

    try {
      await this.contentCalendarService.scheduleProduct(product.id);
    } catch (err) {
      this.logger.warn(
        `Could not schedule content calendar for product ${product.id}: ${err instanceof Error ? err.message : err}`,
      );
    }

    return product;
  }
}
