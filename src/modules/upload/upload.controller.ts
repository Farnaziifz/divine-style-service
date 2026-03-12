import {
  Controller,
  Post,
  Get,
  Param,
  Res,
  StreamableFile,
  UseInterceptors,
  UploadedFile,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { Response } from 'express';
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
import { MinioService } from '../shared/minio/minio.service';

@ApiTags('Upload')
@Controller('upload')
export class UploadController {
  constructor(private readonly minioService: MinioService) {}

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
    const url = await this.minioService.uploadFile(file, 'uploads');
    return { url };
  }

  @Get(':folder/:filename')
  @ApiOperation({ summary: 'دریافت فایل' })
  async getFile(
    @Param('folder') folder: string,
    @Param('filename') filename: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const key = `${folder}/${filename}`;
    // TODO: Validate folder/filename to prevent traversal attacks
    // But MinIO key logic is simple.

    // Check if MinioService method returns Readable
    const { stream, contentType } = await this.minioService.getFileStream(key);
    res.set({
      'Content-Type': contentType,
    });
    return new StreamableFile(stream);
  }
}
