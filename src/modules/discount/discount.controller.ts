import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
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

  private assertCanWrite(req: any) {
    const isAdmin = req.user?.role === 'ADMIN';
    const isOperatorWithPermission =
      req.user?.role === 'OPERATOR' &&
      Array.isArray(req.user?.permissions) &&
      req.user.permissions.includes('DISCOUNTS_WRITE');
    if (!isAdmin && !isOperatorWithPermission) {
      throw new ForbiddenException();
    }
  }

  @Post()
  @ApiOperation({ summary: 'ایجاد کد تخفیف' })
  create(@Req() req: any, @Body() dto: CreateDiscountCodeDto) {
    this.assertCanWrite(req);
    return this.discountService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'لیست کدهای تخفیف (صفحه‌بندی)' })
  findAll(@Req() req: any, @Query() query: DiscountCodeQueryDto) {
    this.assertCanWrite(req);
    return this.discountService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'جزئیات یک کد تخفیف' })
  @ApiParam({ name: 'id', type: String })
  findOne(@Req() req: any, @Param('id') id: string) {
    this.assertCanWrite(req);
    return this.discountService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'ویرایش کد تخفیف' })
  @ApiParam({ name: 'id', type: String })
  update(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateDiscountCodeDto,
  ) {
    this.assertCanWrite(req);
    return this.discountService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'حذف نرم کد تخفیف' })
  @ApiParam({ name: 'id', type: String })
  remove(@Req() req: any, @Param('id') id: string) {
    this.assertCanWrite(req);
    return this.discountService.remove(id);
  }
}
