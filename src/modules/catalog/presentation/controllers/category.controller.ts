import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Query,
  Req,
  ForbiddenException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiConsumes,
} from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { CreateCategoryDto } from '../dtos/create-category.dto';
import { UpdateCategoryDto } from '../dtos/update-category.dto';
import { CreateCategoryCommand } from '../../application/commands/create-category.command';
import { UpdateCategoryCommand } from '../../application/commands/update-category.command';
import { DeleteCategoryCommand } from '../../application/commands/delete-category.command';
import { GetCategoriesQuery } from '../../application/queries/get-categories.query';
import { GetCategoryQuery } from '../../application/queries/get-category.query';
import { MinioService } from '../../../shared/minio/minio.service';
import { PaginationDto } from '../../../shared/dtos/pagination.dto';

@ApiTags('Categories')
@Controller('categories')
export class CategoryController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
    private readonly minioService: MinioService,
  ) {}

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

  @Post()
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create category' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('image'))
  async create(
    @Req() req: any,
    @Body() createCategoryDto: CreateCategoryDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    this.assertCanWrite(req);
    if (file) {
      const image = await this.minioService.uploadFile(file, 'categories');
      createCategoryDto.image = image;
    }
    return this.commandBus.execute(
      new CreateCategoryCommand(createCategoryDto),
    );
  }

  @Get()
  @ApiOperation({ summary: 'Get all categories' })
  findAll(@Query() pagination: PaginationDto) {
    return this.queryBus.execute(new GetCategoriesQuery(pagination));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get category by id' })
  findOne(@Param('id') id: string) {
    return this.queryBus.execute(new GetCategoryQuery(id));
  }

  @Patch(':id')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update category' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('image'))
  async update(
    @Param('id') id: string,
    @Req() req: any,
    @Body() updateCategoryDto: UpdateCategoryDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    this.assertCanWrite(req);
    if (file) {
      const image = await this.minioService.uploadFile(file, 'categories');
      updateCategoryDto.image = image;
    }
    return this.commandBus.execute(
      new UpdateCategoryCommand(id, updateCategoryDto),
    );
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete category' })
  remove(@Param('id') id: string, @Req() req: any) {
    this.assertCanWrite(req);
    return this.commandBus.execute(new DeleteCategoryCommand(id));
  }
}
