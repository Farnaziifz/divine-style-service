import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../shared/prisma/prisma.service';
import { PaginationDto } from '../shared/dtos/pagination.dto';

@ApiTags('Blog')
@Controller('blog')
export class BlogController {
  constructor(private readonly prisma: PrismaService) {}

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
  @ApiOperation({ summary: 'List blog categories' })
  async listCategories() {
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

  @Get('posts')
  @ApiOperation({ summary: 'List published blog posts' })
  async listPosts(
    @Query() pagination: PaginationDto,
    @Query('categorySlug') categorySlug?: string,
  ) {
    const page = pagination.page ?? 1;
    const limit = Math.min(Math.max(pagination.limit ?? 10, 1), 50);
    const skip = (page - 1) * limit;

    const where: any = {
      isDeleted: false,
      status: 'PUBLISHED',
    };
    if (categorySlug?.trim()) {
      where.category = { is: { slug: categorySlug.trim(), isDeleted: false } };
    }
    const search = (pagination.search ?? '').trim();
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { excerpt: { contains: search, mode: 'insensitive' } },
        { slug: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [total, data] = await this.prisma.$transaction([
      this.prisma.blogPost.count({ where }),
      this.prisma.blogPost.findMany({
        where,
        orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
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
        title: p.title,
        slug: p.slug,
        excerpt: p.excerpt,
        coverImageUrl: p.coverImageUrl,
        coverImageAlt: p.coverImageAlt,
        publishedAt: p.publishedAt,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
        category: p.category,
      })),
      meta: {
        total,
        page,
        limit,
        lastPage: Math.ceil(total / limit),
      },
    };
  }

  @Get('posts/:slug')
  @ApiOperation({ summary: 'Get published blog post by slug' })
  async getPostBySlug(@Param('slug') slug: string) {
    const post = await this.prisma.blogPost.findFirst({
      where: {
        isDeleted: false,
        status: 'PUBLISHED',
        slug,
      },
      include: {
        category: {
          select: { id: true, title: true, slug: true },
        },
      },
    });

    if (!post) throw new BadRequestException('Post not found');

    return {
      id: post.id,
      title: post.title,
      slug: post.slug,
      excerpt: post.excerpt,
      content: post.content,
      coverImageUrl: post.coverImageUrl,
      coverImageAlt: post.coverImageAlt,
      publishedAt: post.publishedAt,
      createdAt: post.createdAt,
      updatedAt: post.updatedAt,
      category: post.category,
      seo: {
        title: post.seoTitle,
        description: post.seoDescription,
        keywords: post.seoKeywords,
        canonicalUrl: post.canonicalUrl,
        ogTitle: post.ogTitle,
        ogDescription: post.ogDescription,
        ogImageUrl: post.ogImageUrl,
        robotsNoIndex: post.robotsNoIndex,
        robotsNoFollow: post.robotsNoFollow,
      },
    };
  }
}
