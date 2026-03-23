import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Body,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { PrismaService } from '../shared/prisma/prisma.service';
import { MinioService } from '../shared/minio/minio.service';
import { SendDirectMessageDto } from './dtos/send-direct-message.dto';

const MAX_DIRECT_IMAGE_SIZE_BYTES = 3 * 1024 * 1024;
const MAX_DIRECT_AUDIO_SIZE_BYTES = 10 * 1024 * 1024;

@ApiTags('Direct')
@Controller('direct')
export class DirectController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly minio: MinioService,
  ) {}

  private async getOrCreateConversation(userId: string) {
    return this.prisma.directConversation.upsert({
      where: { userId },
      create: { userId },
      update: {
        isDeleted: false,
        deletedAt: null,
      },
      select: {
        id: true,
        userId: true,
        userLastReadAt: true,
        adminLastReadAt: true,
      },
    });
  }

  @Get('conversation')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get my direct conversation (create if not exists)',
  })
  async getConversation(@Req() req: any) {
    const c = await this.getOrCreateConversation(req.user.id);
    return c;
  }

  @Get('messages')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List my direct messages (supports since ISO)' })
  async listMessages(
    @Req() req: any,
    @Query('limit') limitRaw?: string,
    @Query('since') since?: string,
  ) {
    const userId = req.user.id;
    const conversation = await this.getOrCreateConversation(userId);
    const limit = Math.min(Math.max(Number(limitRaw || 50) || 50, 1), 200);
    const sinceDate = since ? new Date(since) : null;
    const where: any = { conversationId: conversation.id, isDeleted: false };
    if (sinceDate && !Number.isNaN(sinceDate.getTime())) {
      where.createdAt = { gt: sinceDate };
    }
    const items = await this.prisma.directMessage.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      take: limit,
      select: {
        id: true,
        authorRole: true,
        authorUserId: true,
        text: true,
        attachmentType: true,
        attachmentUrl: true,
        createdAt: true,
      },
    });
    await this.prisma.directConversation.update({
      where: { id: conversation.id },
      data: { userLastReadAt: new Date() },
      select: { id: true },
    });
    return { conversationId: conversation.id, messages: items };
  }

  @Post('messages')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Send direct message (text + optional file)' })
  async sendMessage(
    @Req() req: any,
    @Body() dto: SendDirectMessageDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    const userId = req.user.id;
    const conversation = await this.getOrCreateConversation(userId);

    const text = dto.text?.trim() || null;
    const hasFile = !!file;
    if (!text && !hasFile) {
      throw new BadRequestException('متن یا فایل الزامی است');
    }

    let attachmentUrl: string | null = null;
    let attachmentType: 'IMAGE' | 'AUDIO' | null = null;
    if (file) {
      const type = dto.attachmentType;
      if (!type) throw new BadRequestException('نوع فایل مشخص نیست');
      if (type === 'IMAGE') {
        if (!file.mimetype?.startsWith('image/')) {
          throw new BadRequestException('نوع فایل عکس معتبر نیست');
        }
        if (file.size > MAX_DIRECT_IMAGE_SIZE_BYTES) {
          throw new BadRequestException('حداکثر حجم عکس ۳ مگابایت است');
        }
      }
      if (type === 'AUDIO') {
        if (!file.mimetype?.startsWith('audio/')) {
          throw new BadRequestException('نوع فایل صوتی معتبر نیست');
        }
        if (file.size > MAX_DIRECT_AUDIO_SIZE_BYTES) {
          throw new BadRequestException('حداکثر حجم فایل صوتی ۱۰ مگابایت است');
        }
      }
      attachmentType = type;
      const folder = type === 'AUDIO' ? 'direct-audio' : 'direct-images';
      attachmentUrl = await this.minio.uploadFile(file, folder);
    }

    const created = await this.prisma.directMessage.create({
      data: {
        conversationId: conversation.id,
        authorRole: 'USER',
        authorUserId: userId,
        text,
        attachmentType: attachmentType ?? undefined,
        attachmentUrl: attachmentUrl ?? undefined,
      },
      select: {
        id: true,
        authorRole: true,
        authorUserId: true,
        text: true,
        attachmentType: true,
        attachmentUrl: true,
        createdAt: true,
      },
    });

    await this.prisma.directConversation.update({
      where: { id: conversation.id },
      data: { updatedAt: new Date() },
      select: { id: true },
    });

    return created;
  }
}
