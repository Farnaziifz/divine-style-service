import { Controller, Post, Delete, Get, Body, Param, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { ShoppingListService } from './shopping-list.service';

class AddToShoppingListDto {
  productId: string;
}

@ApiTags('Shopping List (لیست خرید)')
@Controller('shopping-list')
export class ShoppingListController {
  constructor(private readonly shoppingListService: ShoppingListService) {}

  @Post()
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'اضافه کردن محصول به لیست خرید' })
  add(@Req() req: any, @Body() dto: AddToShoppingListDto) {
    return this.shoppingListService.add(req.user.id, dto.productId);
  }

  @Delete(':productId')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'حذف محصول از لیست خرید' })
  remove(@Req() req: any, @Param('productId') productId: string) {
    return this.shoppingListService.remove(req.user.id, productId);
  }

  @Get()
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'دریافت لیست خرید کاربر' })
  getMyList(@Req() req: any) {
    return this.shoppingListService.findAllByUserId(req.user.id);
  }

  @Get('has/:productId')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'بررسی وجود محصول در لیست خرید' })
  async hasProduct(@Req() req: any, @Param('productId') productId: string) {
    const inList = await this.shoppingListService.hasProduct(req.user.id, productId);
    return { inList };
  }
}
