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
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import slugify from 'slugify';
import { PrismaService } from '../shared/prisma/prisma.service';
import { MinioService } from '../shared/minio/minio.service';
import { PaginationDto } from '../shared/dtos/pagination.dto';
import { CreateBlogCategoryDto } from './dtos/create-blog-category.dto';
import { UpdateBlogCategoryDto } from './dtos/update-blog-category.dto';
import { CreateBlogPostDto } from './dtos/create-blog-post.dto';
import { UpdateBlogPostDto } from './dtos/update-blog-post.dto';

const MAX_BLOG_IMAGE_SIZE_BYTES = 3 * 1024 * 1024;

@ApiTags('Admin Blog')
@Controller('admin/blog')
export class AdminBlogController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly minio: MinioService,
  ) {}

  private assertCanManage(req: any) {
    const isAdmin = req.user?.role === 'ADMIN';
    const isOperatorWithPermission =
      req.user?.role === 'OPERATOR' &&
      Array.isArray(req.user?.permissions) &&
      req.user.permissions.includes('BLOG_MANAGE');
    if (!isAdmin && !isOperatorWithPermission) {
      throw new ForbiddenException();
    }
  }

  private normalizeSlug(value: string) {
    const base = slugify(value, {
      lower: true,
      strict: true,
      trim: true,
    });
    return base;
  }

  private async ensureUniqueCategorySlug(slug: string) {
    let base = this.normalizeSlug(slug);
    if (!base) throw new BadRequestException('Slug is invalid');
    for (let attempt = 0; attempt < 5; attempt++) {
      const exists = await this.prisma.blogCategory.findUnique({
        where: { slug: base },
        select: { id: true },
      });
      if (!exists) return base;
      base = `${base}-${Math.floor(Math.random() * 1_000_000)}`;
    }
    return `${base}-${Date.now()}`;
  }

  private async ensureUniquePostSlug(slug: string, excludeId?: string) {
    let base = this.normalizeSlug(slug);
    if (!base) throw new BadRequestException('Slug is invalid');
    for (let attempt = 0; attempt < 5; attempt++) {
      const exists = await this.prisma.blogPost.findFirst({
        where: {
          slug: base,
          ...(excludeId ? { id: { not: excludeId } } : {}),
        },
        select: { id: true },
      });
      if (!exists) return base;
      base = `${base}-${Math.floor(Math.random() * 1_000_000)}`;
    }
    return `${base}-${Date.now()}`;
  }

  private parseDate(value?: string) {
    if (!value) return null;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    return d;
  }

  private toNumber(value: any): number {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const n = Number(value);
      return Number.isFinite(n) ? n : 0;
    }
    if (value && typeof value.toNumber === 'function') {
      const n = value.toNumber();
      return Number.isFinite(n) ? n : 0;
    }
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  @Get('categories')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List blog categories (admin)' })
  async listCategories(@Req() req: any) {
    this.assertCanManage(req);
    return this.prisma.blogCategory.findMany({
      where: { isDeleted: false },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        slug: true,
        description: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  @Post('categories')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create blog category (admin)' })
  async createCategory(@Req() req: any, @Body() dto: CreateBlogCategoryDto) {
    this.assertCanManage(req);
    const title = dto.title.trim();
    const slug = await this.ensureUniqueCategorySlug(dto.slug?.trim() || title);
    return this.prisma.blogCategory.create({
      data: {
        title,
        slug,
        description: dto.description?.trim() || null,
      },
      select: {
        id: true,
        title: true,
        slug: true,
        description: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  @Patch('categories/:id')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update blog category (admin)' })
  async updateCategory(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateBlogCategoryDto,
  ) {
    this.assertCanManage(req);
    const data: any = {};
    if (dto.title !== undefined) data.title = dto.title.trim();
    if (dto.description !== undefined)
      data.description = dto.description?.trim() || null;
    if (dto.slug !== undefined) {
      data.slug = await this.ensureUniqueCategorySlug(dto.slug.trim());
    }
    return this.prisma.blogCategory.update({
      where: { id },
      data,
      select: {
        id: true,
        title: true,
        slug: true,
        description: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  @Patch('categories/:id/delete')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Soft delete blog category (admin)' })
  async deleteCategory(@Req() req: any, @Param('id') id: string) {
    this.assertCanManage(req);
    return this.prisma.blogCategory.update({
      where: { id },
      data: { isDeleted: true, deletedAt: new Date() },
      select: { id: true },
    });
  }

  @Get('posts')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List blog posts (admin)' })
  async listPosts(
    @Req() req: any,
    @Query() pagination: PaginationDto,
    @Query('status') status?: 'DRAFT' | 'PUBLISHED',
    @Query('categoryId') categoryId?: string,
  ) {
    this.assertCanManage(req);
    const page = pagination.page ?? 1;
    const limit = Math.min(Math.max(pagination.limit ?? 10, 1), 50);
    const skip = (page - 1) * limit;

    const where: any = { isDeleted: false };
    if (status === 'DRAFT' || status === 'PUBLISHED') {
      where.status = status;
    }
    if (categoryId?.trim()) {
      where.categoryId = categoryId.trim();
    }
    const search = (pagination.search ?? '').trim();
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { slug: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [total, data] = await this.prisma.$transaction([
      this.prisma.blogPost.count({ where }),
      this.prisma.blogPost.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }],
        skip,
        take: limit,
        include: {
          category: {
            select: { id: true, title: true, slug: true },
          },
        },
      }),
    ]);

    return {
      data: data.map((p) => ({
        id: p.id,
        category: p.category,
        status: p.status,
        publishedAt: p.publishedAt,
        title: p.title,
        slug: p.slug,
        excerpt: p.excerpt,
        coverImageUrl: p.coverImageUrl,
        coverImageAlt: p.coverImageAlt,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      })),
      meta: {
        total,
        page,
        limit,
        lastPage: Math.ceil(total / limit),
      },
    };
  }

  @Post('posts')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create blog post (admin)' })
  async createPost(@Req() req: any, @Body() dto: CreateBlogPostDto) {
    this.assertCanManage(req);
    const category = await this.prisma.blogCategory.findFirst({
      where: { id: dto.categoryId, isDeleted: false },
      select: { id: true },
    });
    if (!category) throw new BadRequestException('Category not found');

    const title = dto.title.trim();
    const slug = await this.ensureUniquePostSlug(dto.slug?.trim() || title);
    const status = dto.status ?? 'DRAFT';
    const publishedAt =
      status === 'PUBLISHED'
        ? (this.parseDate(dto.publishedAt) ?? new Date())
        : null;

    return this.prisma.blogPost.create({
      data: {
        categoryId: dto.categoryId,
        status,
        publishedAt,
        title,
        slug,
        excerpt: dto.excerpt?.trim() || null,
        content: dto.content,
        coverImageUrl: dto.coverImageUrl?.trim() || null,
        coverImageAlt: dto.coverImageAlt?.trim() || null,
        seoTitle: dto.seoTitle?.trim() || null,
        seoDescription: dto.seoDescription?.trim() || null,
        seoKeywords: Array.isArray(dto.seoKeywords)
          ? dto.seoKeywords.map((k) => String(k).trim()).filter(Boolean)
          : [],
        canonicalUrl: dto.canonicalUrl?.trim() || null,
        ogTitle: dto.ogTitle?.trim() || null,
        ogDescription: dto.ogDescription?.trim() || null,
        ogImageUrl: dto.ogImageUrl?.trim() || null,
        robotsNoIndex: dto.robotsNoIndex ?? false,
        robotsNoFollow: dto.robotsNoFollow ?? false,
      },
      include: {
        category: { select: { id: true, title: true, slug: true } },
      },
    });
  }

  @Get('posts/:id')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get blog post (admin)' })
  async getPost(@Req() req: any, @Param('id') id: string) {
    this.assertCanManage(req);
    const post = await this.prisma.blogPost.findFirst({
      where: { id, isDeleted: false },
      include: {
        category: { select: { id: true, title: true, slug: true } },
      },
    });
    if (!post) throw new BadRequestException('Post not found');
    return post;
  }

  @Patch('posts/:id')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update blog post (admin)' })
  async updatePost(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateBlogPostDto,
  ) {
    this.assertCanManage(req);
    const existing = await this.prisma.blogPost.findFirst({
      where: { id, isDeleted: false },
      select: { id: true, status: true, publishedAt: true },
    });
    if (!existing) throw new BadRequestException('Post not found');

    const data: any = {};
    if (dto.categoryId !== undefined) {
      const category = await this.prisma.blogCategory.findFirst({
        where: { id: dto.categoryId, isDeleted: false },
        select: { id: true },
      });
      if (!category) throw new BadRequestException('Category not found');
      data.categoryId = dto.categoryId;
    }
    if (dto.title !== undefined) data.title = dto.title.trim();
    if (dto.slug !== undefined) {
      data.slug = await this.ensureUniquePostSlug(dto.slug.trim(), id);
    }
    if (dto.excerpt !== undefined) data.excerpt = dto.excerpt?.trim() || null;
    if (dto.content !== undefined) data.content = dto.content;
    if (dto.coverImageUrl !== undefined)
      data.coverImageUrl = dto.coverImageUrl?.trim() || null;
    if (dto.coverImageAlt !== undefined)
      data.coverImageAlt = dto.coverImageAlt?.trim() || null;
    if (dto.seoTitle !== undefined)
      data.seoTitle = dto.seoTitle?.trim() || null;
    if (dto.seoDescription !== undefined)
      data.seoDescription = dto.seoDescription?.trim() || null;
    if (dto.seoKeywords !== undefined) {
      data.seoKeywords = Array.isArray(dto.seoKeywords)
        ? dto.seoKeywords.map((k) => String(k).trim()).filter(Boolean)
        : [];
    }
    if (dto.canonicalUrl !== undefined)
      data.canonicalUrl = dto.canonicalUrl?.trim() || null;
    if (dto.ogTitle !== undefined) data.ogTitle = dto.ogTitle?.trim() || null;
    if (dto.ogDescription !== undefined)
      data.ogDescription = dto.ogDescription?.trim() || null;
    if (dto.ogImageUrl !== undefined)
      data.ogImageUrl = dto.ogImageUrl?.trim() || null;
    if (dto.robotsNoIndex !== undefined) data.robotsNoIndex = dto.robotsNoIndex;
    if (dto.robotsNoFollow !== undefined)
      data.robotsNoFollow = dto.robotsNoFollow;

    const nextStatus = dto.status ?? existing.status;
    if (dto.status !== undefined) {
      data.status = dto.status;
      if (nextStatus === 'PUBLISHED') {
        data.publishedAt =
          this.parseDate(dto.publishedAt) ?? existing.publishedAt ?? new Date();
      } else {
        data.publishedAt = null;
      }
    } else if (dto.publishedAt !== undefined) {
      data.publishedAt = this.parseDate(dto.publishedAt);
    }

    return this.prisma.blogPost.update({
      where: { id },
      data,
      include: {
        category: { select: { id: true, title: true, slug: true } },
      },
    });
  }

  @Patch('posts/:id/delete')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Soft delete blog post (admin)' })
  async deletePost(@Req() req: any, @Param('id') id: string) {
    this.assertCanManage(req);
    return this.prisma.blogPost.update({
      where: { id },
      data: { isDeleted: true, deletedAt: new Date() },
      select: { id: true },
    });
  }

  @Post('posts/:id/cover')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Upload blog cover image (admin)' })
  async uploadCover(
    @Req() req: any,
    @Param('id') id: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    this.assertCanManage(req);
    const post = await this.prisma.blogPost.findFirst({
      where: { id, isDeleted: false },
      select: { id: true },
    });
    if (!post) throw new BadRequestException('Post not found');
    if (!file) throw new BadRequestException('فایل الزامی است');
    if (!file.mimetype?.startsWith('image/')) {
      throw new BadRequestException('فقط فایل تصویری مجاز است');
    }
    if (file.size > MAX_BLOG_IMAGE_SIZE_BYTES) {
      throw new BadRequestException('حداکثر حجم عکس ۳ مگابایت است');
    }
    const url = await this.minio.uploadFile(file, 'blog-covers');
    return this.prisma.blogPost.update({
      where: { id: post.id },
      data: { coverImageUrl: url },
      select: {
        id: true,
        coverImageUrl: true,
      },
    });
  }
}
