import { Body, Controller, HttpCode, HttpStatus, Post, UseFilters, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { TorobFeedService, TorobProductsResponse } from './torob-feed.service';
import { TorobProductsRequestDto } from './dto/torob-products-request.dto';
import { TorobTokenGuard } from './guards/torob-token.guard';
import { TorobErrorFilter } from './filters/torob-error.filter';

/**
 * پیاده‌سازی endpoint سمت فروشگاه برای TorobAPI v3، طبق مستندات
 * panel.torob.com/s/torobApiV3 — جایگزین/مکمل متاتگ‌های محصول.
 */
@ApiExcludeController()
@Controller('torob-api/v3')
@UseGuards(TorobTokenGuard)
@UseFilters(TorobErrorFilter)
export class TorobFeedController {
  constructor(private readonly torobFeedService: TorobFeedService) {}

  @Post('products')
  @HttpCode(HttpStatus.OK)
  async getProducts(@Body() dto: TorobProductsRequestDto): Promise<TorobProductsResponse> {
    return this.torobFeedService.handleRequest(dto);
  }
}
