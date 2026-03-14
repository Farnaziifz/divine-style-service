import {
  Controller,
  Get,
  Put,
  Body,
  UseGuards,
  Req,
  Query,
  Param,
} from '@nestjs/common';
import { UserService } from './user.service';
import { UpdateUserDto } from './dtos/update-user.dto';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiQuery,
} from '@nestjs/swagger';

@ApiTags('User')
@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get('testimonials')
  @ApiOperation({
    summary: 'دریافت نظرات تأییدشده (تستیمونیال) برای صفحه اصلی',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'تعداد (پیش‌فرض ۱۰، حداکثر ۵۰)',
  })
  @ApiResponse({ status: 200, description: 'لیست نظرات تأییدشده' })
  getTestimonials(@Query('limit') limit?: number) {
    return this.userService.getTestimonials(limit ? Number(limit) : 10);
  }

  @Get('profile')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'دریافت اطلاعات پروفایل کاربر' })
  @ApiResponse({ status: 200, description: 'اطلاعات پروفایل دریافت شد' })
  getProfile(@Req() req: any) {
    return this.userService.getProfile(req.user.id);
  }

  @Put('profile')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'ویرایش اطلاعات پروفایل کاربر' })
  @ApiResponse({ status: 200, description: 'پروفایل با موفقیت ویرایش شد' })
  updateProfile(@Req() req: any, @Body() updateUserDto: UpdateUserDto) {
    return this.userService.updateProfile(req.user.id, updateUserDto);
  }

  @Get('list')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'دریافت لیست کاربران' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'name', required: false, type: String })
  @ApiQuery({ name: 'mobile', required: false, type: String })
  @ApiResponse({ status: 200, description: 'لیست کاربران دریافت شد' })
  findAll(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('name') name?: string,
    @Query('mobile') mobile?: string,
  ) {
    return this.userService.findAll(Number(page), Number(limit), name, mobile);
  }

  @Get(':id')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'دریافت جزئیات کاربر' })
  @ApiResponse({ status: 200, description: 'جزئیات کاربر دریافت شد' })
  findOne(@Param('id') id: string) {
    return this.userService.getProfile(id);
  }
}
