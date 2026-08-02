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
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { ContentCalendarService } from './content-calendar.service';
import { ContentCalendarRangeDto } from './dtos/content-calendar-range.dto';
import { ToggleEntryDto } from './dtos/toggle-entry.dto';
import { CreateEntryDto } from './dtos/create-entry.dto';
import { UpdateSettingsDto } from './dtos/update-settings.dto';

@ApiTags('Content calendar')
@Controller('content-calendar')
@UseGuards(AuthGuard('jwt'))
@ApiBearerAuth()
export class ContentCalendarController {
  constructor(private readonly contentCalendarService: ContentCalendarService) {}

  private assertCanWrite(req: any) {
    const isAdmin = req.user?.role === 'ADMIN';
    const isOperatorWithPermission =
      req.user?.role === 'OPERATOR' &&
      Array.isArray(req.user?.permissions) &&
      req.user.permissions.includes('PRODUCTS_WRITE');
    if (!isAdmin && !isOperatorWithPermission) {
      throw new ForbiddenException();
    }
  }

  @Get()
  @ApiOperation({ summary: 'برنامه تقویم محتوایی در یک بازه تاریخی' })
  findRange(@Req() req: any, @Query() query: ContentCalendarRangeDto) {
    this.assertCanWrite(req);
    return this.contentCalendarService.findRange(query.from, query.to);
  }

  @Get('settings')
  @ApiOperation({ summary: 'تنظیمات تقویم محتوایی (فاصله بازتولید محتوا)' })
  getSettings(@Req() req: any) {
    this.assertCanWrite(req);
    return this.contentCalendarService.getSettings();
  }

  @Patch('settings')
  @ApiOperation({ summary: 'تغییر تنظیمات تقویم محتوایی' })
  updateSettings(@Req() req: any, @Body() dto: UpdateSettingsDto) {
    this.assertCanWrite(req);
    return this.contentCalendarService.updateSettings(dto.replanIntervalDays);
  }

  @Patch(':id/toggle')
  @ApiOperation({ summary: 'تیک زدن/برداشتن یک آیتم به عنوان انجام‌شده' })
  @ApiParam({ name: 'id', type: String })
  toggle(@Req() req: any, @Param('id') id: string, @Body() dto: ToggleEntryDto) {
    this.assertCanWrite(req);
    return this.contentCalendarService.toggle(id, dto.isDone);
  }

  @Post()
  @ApiOperation({ summary: 'افزودن دستی یک آیتم محتوایی' })
  create(@Req() req: any, @Body() dto: CreateEntryDto) {
    this.assertCanWrite(req);
    return this.contentCalendarService.createManual(dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'حذف یک آیتم محتوایی' })
  @ApiParam({ name: 'id', type: String })
  remove(@Req() req: any, @Param('id') id: string) {
    this.assertCanWrite(req);
    return this.contentCalendarService.remove(id);
  }
}
