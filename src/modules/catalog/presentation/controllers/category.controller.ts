import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { CreateCategoryDto } from '../dtos/create-category.dto';
import { UpdateCategoryDto } from '../dtos/update-category.dto';
import { CreateCategoryCommand } from '../../application/commands/create-category.command';
import { UpdateCategoryCommand } from '../../application/commands/update-category.command';
import { DeleteCategoryCommand } from '../../application/commands/delete-category.command';
import { GetCategoriesQuery } from '../../application/queries/get-categories.query';
import { GetCategoryQuery } from '../../application/queries/get-category.query';

@ApiTags('Categories')
@Controller('categories')
export class CategoryController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Post()
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create category' })
  create(@Body() createCategoryDto: CreateCategoryDto) {
    return this.commandBus.execute(
      new CreateCategoryCommand(createCategoryDto),
    );
  }

  @Get()
  @ApiOperation({ summary: 'Get all categories' })
  findAll() {
    return this.queryBus.execute(new GetCategoriesQuery());
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
  update(
    @Param('id') id: string,
    @Body() updateCategoryDto: UpdateCategoryDto,
  ) {
    return this.commandBus.execute(
      new UpdateCategoryCommand(id, updateCategoryDto),
    );
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete category' })
  remove(@Param('id') id: string) {
    return this.commandBus.execute(new DeleteCategoryCommand(id));
  }
}
