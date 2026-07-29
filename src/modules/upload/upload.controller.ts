import {
  Controller,
  Post,
  Get,
  Param,
  Req,
  Res,
  StreamableFile,
  UseInterceptors,
  UploadedFile,
  UseGuards,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiConsumes,
  ApiBody,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { JwtService } from '@nestjs/jwt';
import { MinioService } from '../shared/minio/minio.service';
import { PrismaService } from '../shared/prisma/prisma.service';

const MAX_IMAGE_SIZE_BYTES = 3 * 1024 * 1024;

// این پوشه‌ها فایل‌های خصوصی چت مستقیم هستن — فقط طرفین همون گفتگو یا استف باید ببینن‌شون
const PRIVATE_FOLDERS = new Set(['direct-images', 'direct-audio']);
const SAFE_FOLDER = /^[A-Za-z0-9_-]+$/;
const SAFE_FILENAME = /^[A-Za-z0-9_-]+\.[A-Za-z0-9]+$/;

@ApiTags('Upload')
@Controller('upload')
export class UploadController {
  constructor(
    private readonly minioService: MinioService,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  private async authenticateOptional(req: Request) {
    const authHeader = req.headers['authorization'];
    if (!authHeader?.startsWith('Bearer ')) return null;
    const token = authHeader.slice(7);
    try {
      const payload = await this.jwtService.verifyAsync(token, {
        secret: 'secretKey', // TODO: Use env variable
      });
      return this.prisma.user.findUnique({ where: { id: payload.sub } });
    } catch {
      return null;
    }
  }

  @Post()
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'آپلود فایل' })
  @ApiResponse({
    status: 201,
    description: 'فایل با موفقیت آپلود شد',
    schema: {
      type: 'object',
      properties: {
        url: { type: 'string' },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  async uploadFile(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('فایل الزامی است');
    }
    if (!file.mimetype?.startsWith('image/')) {
      throw new BadRequestException('فقط فایل تصویری مجاز است');
    }
    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      throw new BadRequestException('حداکثر حجم عکس ۳ مگابایت است');
    }
    const url = await this.minioService.uploadFile(file, 'uploads');
    return { url };
  }

  @Get(':folder/:filename')
  @ApiOperation({ summary: 'دریافت فایل' })
  async getFile(
    @Param('folder') folder: string,
    @Param('filename') filename: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!SAFE_FOLDER.test(folder) || !SAFE_FILENAME.test(filename)) {
      throw new BadRequestException('مسیر فایل نامعتبر است');
    }
    const key = `${folder}/${filename}`;

    if (PRIVATE_FOLDERS.has(folder)) {
      const user = await this.authenticateOptional(req);
      const isStaff = user?.role === 'ADMIN' || user?.role === 'OPERATOR';
      if (!user) throw new ForbiddenException();
      if (!isStaff) {
        const message = await this.prisma.directMessage.findFirst({
          where: { attachmentUrl: `/upload/${key}` },
          select: { conversation: { select: { userId: true } } },
        });
        if (!message || message.conversation.userId !== user.id) {
          throw new ForbiddenException();
        }
      }
    }

    const { stream, contentType } = await this.minioService.getFileStream(key);
    res.set({
      'Content-Type': contentType,
    });
    return new StreamableFile(stream);
  }
}
