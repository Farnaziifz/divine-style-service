import {
  Controller,
  ForbiddenException,
  Get,
  Param,
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
import { SegmentService } from './segment.service';

@ApiTags('Loyalty — Customer segments')
@Controller('loyalty/segments')
@UseGuards(AuthGuard('jwt'))
@ApiBearerAuth()
export class SegmentController {
  constructor(private readonly segmentService: SegmentService) {}

  private assertCanView(req: any) {
    const isAdmin = req.user?.role === 'ADMIN';
    const isOperatorWithPermission =
      req.user?.role === 'OPERATOR' &&
      Array.isArray(req.user?.permissions) &&
      req.user.permissions.includes('LOYALTY_CLUB_MANAGE');
    if (!isAdmin && !isOperatorWithPermission) {
      throw new ForbiddenException();
    }
  }

  @Get()
  @ApiOperation({ summary: 'لیست سگمنت‌های مشتریان با تعداد اعضای فعلی' })
  listSegments(@Req() req: any) {
    this.assertCanView(req);
    return this.segmentService.listSegments();
  }

  @Get(':id/members')
  @ApiOperation({
    summary: 'مشتریانی که الان در این سگمنت هستند، با آخرین مقادیر RFM',
  })
  @ApiParam({ name: 'id', type: String })
  getSegmentMembers(@Req() req: any, @Param('id') id: string) {
    this.assertCanView(req);
    return this.segmentService.getSegmentMembers(id);
  }
}
