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
import { CustomerGroupService } from './customer-group.service';
import { CreateCustomerGroupDto } from './dtos/create-customer-group.dto';
import { UpdateCustomerGroupDto } from './dtos/update-customer-group.dto';
import { CustomerGroupQueryDto } from './dtos/customer-group-query.dto';

@ApiTags('Customer groups')
@Controller('customer-groups')
@UseGuards(AuthGuard('jwt'))
@ApiBearerAuth()
export class CustomerGroupController {
  constructor(private readonly customerGroupService: CustomerGroupService) {}

  private assertCanManage(req: any) {
    const isAdmin = req.user?.role === 'ADMIN';
    const isOperatorWithPermission =
      req.user?.role === 'OPERATOR' &&
      Array.isArray(req.user?.permissions) &&
      req.user.permissions.includes('USERS_MANAGE');
    if (!isAdmin && !isOperatorWithPermission) {
      throw new ForbiddenException();
    }
  }

  @Post()
  @ApiOperation({ summary: 'ایجاد دسته‌بندی مشتریان' })
  create(@Req() req: any, @Body() dto: CreateCustomerGroupDto) {
    this.assertCanManage(req);
    return this.customerGroupService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'لیست دسته‌بندی‌های مشتریان (صفحه‌بندی)' })
  findAll(@Req() req: any, @Query() query: CustomerGroupQueryDto) {
    this.assertCanManage(req);
    return this.customerGroupService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'جزئیات یک دسته‌بندی به‌همراه اعضا' })
  @ApiParam({ name: 'id', type: String })
  findOne(@Req() req: any, @Param('id') id: string) {
    this.assertCanManage(req);
    return this.customerGroupService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'ویرایش دسته‌بندی (عنوان/وضعیت/اعضا)' })
  @ApiParam({ name: 'id', type: String })
  update(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateCustomerGroupDto,
  ) {
    this.assertCanManage(req);
    return this.customerGroupService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'حذف نرم دسته‌بندی' })
  @ApiParam({ name: 'id', type: String })
  remove(@Req() req: any, @Param('id') id: string) {
    this.assertCanManage(req);
    return this.customerGroupService.remove(id);
  }
}
