import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
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

@ApiTags('Admin Direct')
@Controller('admin/direct')
export class AdminDirectController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly minio: MinioService,
  ) {}

  private assertCanManage(req: any) {
    const isAdmin = req.user?.role === 'ADMIN';
    const isOperatorWithPermission =
      req.user?.role === 'OPERATOR' &&
      Array.isArray(req.user?.permissions) &&
      req.user.permissions.includes('CHAT_MANAGE');
    if (!isAdmin && !isOperatorWithPermission) {
      throw new ForbiddenException();
    }
  }

  @Get('conversations')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List direct conversations (admin)' })
  async listConversations(
    @Req() req: any,
    @Query('q') q?: string,
    @Query('limit') limitRaw?: string,
  ) {
    this.assertCanManage(req);
    const limit = Math.min(Math.max(Number(limitRaw || 50) || 50, 1), 200);
    const where: any = { isDeleted: false };
    if (q?.trim()) {
      where.user = {
        is: {
          OR: [
            { mobile: { contains: q.trim() } },
            { name: { contains: q.trim(), mode: 'insensitive' } },
            { lastName: { contains: q.trim(), mode: 'insensitive' } },
          ],
        },
      };
    }

    const conversations = await this.prisma.directConversation.findMany({
      where,
      take: limit,
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        userId: true,
        adminLastReadAt: true,
        updatedAt: true,
        user: {
          select: { id: true, mobile: true, name: true, lastName: true },
        },
        messages: {
          where: { isDeleted: false },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            id: true,
            authorRole: true,
            text: true,
            attachmentType: true,
            createdAt: true,
          },
        },
      },
    });

    const conversationIds = conversations.map((c) => c.id);
    const unreadByConversation = new Map<string, number>();

    if (conversationIds.length > 0) {
      const conversationIdSql = conversationIds.map(
        (id) => Prisma.sql`${id}::uuid`,
      );
      const rows = await this.prisma.$queryRaw<
        { conversationId: string; unreadCount: number }[]
      >(Prisma.sql`
        SELECT
          dc.id AS "conversationId",
          COUNT(dm.id)::int AS "unreadCount"
        FROM "DirectConversation" dc
        LEFT JOIN "DirectMessage" dm
          ON dm."conversationId" = dc.id
          AND dm."isDeleted" = false
          AND dm."authorRole" = 'USER'
          AND dm."createdAt" > COALESCE(dc."adminLastReadAt", TO_TIMESTAMP(0))
        WHERE dc.id IN (${Prisma.join(conversationIdSql)})
        GROUP BY dc.id
      `);

      for (const row of rows) {
        unreadByConversation.set(
          row.conversationId,
          Number(row.unreadCount) || 0,
        );
      }
    }

    return conversations.map((c) => {
      const last = c.messages[0] ?? null;
      return {
        id: c.id,
        user: c.user,
        updatedAt: c.updatedAt,
        unreadCount: unreadByConversation.get(c.id) ?? 0,
        lastMessage: last
          ? {
              id: last.id,
              authorRole: last.authorRole,
              text: last.text,
              attachmentType: last.attachmentType,
              createdAt: last.createdAt,
            }
          : null,
      };
    });
  }

  @Get('conversations/:id/messages')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List conversation messages (admin)' })
  async listMessages(
    @Req() req: any,
    @Param('id') id: string,
    @Query('limit') limitRaw?: string,
    @Query('since') since?: string,
  ) {
    this.assertCanManage(req);
    const limit = Math.min(Math.max(Number(limitRaw || 50) || 50, 1), 200);
    const sinceDate = since ? new Date(since) : null;
    const where: any = { conversationId: id, isDeleted: false };
    if (sinceDate && !Number.isNaN(sinceDate.getTime())) {
      where.createdAt = { gt: sinceDate };
    }
    const messages = await this.prisma.directMessage.findMany({
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
      where: { id },
      data: { adminLastReadAt: new Date() },
      select: { id: true },
    });

    return { conversationId: id, messages };
  }

  @Post('conversations/:id/messages')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Send admin message to conversation' })
  async sendMessage(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: SendDirectMessageDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    this.assertCanManage(req);
    const conversation = await this.prisma.directConversation.findFirst({
      where: { id, isDeleted: false },
      select: { id: true },
    });
    if (!conversation) throw new BadRequestException('Conversation not found');

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
      attachmentType = type;
      const folder = type === 'AUDIO' ? 'direct-audio' : 'direct-images';
      attachmentUrl = await this.minio.uploadFile(file, folder);
    }

    const created = await this.prisma.directMessage.create({
      data: {
        conversationId: conversation.id,
        authorRole: 'ADMIN',
        authorUserId: req.user?.id ?? null,
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

  @Patch('conversations/:id/mark-read')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mark conversation as read (admin)' })
  async markRead(@Req() req: any, @Param('id') id: string) {
    this.assertCanManage(req);
    return this.prisma.directConversation.update({
      where: { id },
      data: { adminLastReadAt: new Date() },
      select: { id: true },
    });
  }
}
