import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { DiscountService } from './discount.service';
import { CreateDiscountCodeDto } from './dtos/create-discount-code.dto';
import { UpdateDiscountCodeDto } from './dtos/update-discount-code.dto';
import { DiscountCodeQueryDto } from './dtos/discount-code-query.dto';

@ApiTags('Discount codes')
@Controller('discount-codes')
@UseGuards(AuthGuard('jwt'))
@ApiBearerAuth()
export class DiscountController {
  constructor(private readonly discountService: DiscountService) {}

  @Post()
  @ApiOperation({ summary: 'ایجاد کد تخفیف' })
  create(@Body() dto: CreateDiscountCodeDto) {
    return this.discountService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'لیست کدهای تخفیف (صفحه‌بندی)' })
  findAll(@Query() query: DiscountCodeQueryDto) {
    return this.discountService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'جزئیات یک کد تخفیف' })
  @ApiParam({ name: 'id', type: String })
  findOne(@Param('id') id: string) {
    return this.discountService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'ویرایش کد تخفیف' })
  @ApiParam({ name: 'id', type: String })
  update(@Param('id') id: string, @Body() dto: UpdateDiscountCodeDto) {
    return this.discountService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'حذف نرم کد تخفیف' })
  @ApiParam({ name: 'id', type: String })
  remove(@Param('id') id: string) {
    return this.discountService.remove(id);
  }
}
