import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { UpdateProductCommand } from '../update-product.command';
import { IProductRepository } from '../../../domain/repositories/product.repository.interface';
import { ICategoryRepository } from '../../../domain/repositories/category.repository.interface';
import { PricingService } from '../../services/pricing.service';
import { BadRequestException, Inject, NotFoundException } from '@nestjs/common';
import slugify from 'slugify';

@CommandHandler(UpdateProductCommand)
export class UpdateProductHandler implements ICommandHandler<UpdateProductCommand> {
  constructor(
    @Inject('IProductRepository')
    private readonly repository: IProductRepository,
    @Inject('ICategoryRepository')
    private readonly categoryRepository: ICategoryRepository,
    private readonly pricingService: PricingService,
  ) {}

  async execute(command: UpdateProductCommand) {
    const { id, dto, images } = command;
    const product = await this.repository.findById(id, true);
    if (!product) {
      throw new NotFoundException(`Product with ID ${id} not found`);
    }

    const slug = dto.title ? slugify(dto.title, { lower: true }) : product.slug;

    // اگر بعد از این آپدیت محصول در رگال دسته‌بندی مقصد باشد (چه با فعال کردن showInRack
    // چه با انتقال محصولِ از قبل رگال‌دار به دسته‌بندی دیگر)، سقف ۷ آیتم را چک کن
    const nextCategoryId = dto.categoryId ?? product.categoryId;
    const willBeOnRack = dto.showInRack !== undefined ? dto.showInRack : product.showInRack;
    const categoryChanged = nextCategoryId !== product.categoryId;
    const rackFlagEnabled = dto.showInRack === true && product.showInRack !== true;
    if (willBeOnRack && (categoryChanged || rackFlagEnabled)) {
      const rackCount = await this.repository.countRackItems(nextCategoryId, id);
      if (rackCount >= 7) {
        throw new BadRequestException(
          'این دسته‌بندی از قبل ۷ محصول در رگال دارد؛ ابتدا یکی را از رگال خارج کنید.',
        );
      }
    }

    const updateData: any = { ...dto, slug };
    if (images) {
      updateData.images = images;
    }

    // اگر هزینهٔ خالص یا دسته‌بندی عوض شده، قیمت نهایی را دوباره با فرمول محاسبه کن.
    // کد محصول (code) هرگز بعد از ساخت تغییر نمی‌کند، حتی اگر دسته‌بندی عوض شود.
    if (dto.costPrice != null || dto.categoryId != null) {
      const categoryId = dto.categoryId ?? product.categoryId;
      const category = await this.categoryRepository.findById(categoryId);
      if (!category) {
        throw new NotFoundException('دسته‌بندی یافت نشد');
      }
      const costPrice = dto.costPrice ?? Number(product.costPrice);
      updateData.finalPrice = await this.pricingService.computeFinalPrice(
        costPrice,
        Number(category.profitMultiplier),
      );
    }

    return this.repository.update(id, updateData);
  }
}
