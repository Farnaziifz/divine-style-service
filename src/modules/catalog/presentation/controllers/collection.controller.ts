import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Query,
  Req,
  ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { CreateCollectionDto } from '../dtos/create-collection.dto';
import { UpdateCollectionDto } from '../dtos/update-collection.dto';
import { AuthGuard } from '@nestjs/passport';
import { CreateCollectionCommand } from '../../application/commands/create-collection.command';
import { UpdateCollectionCommand } from '../../application/commands/update-collection.command';
import { DeleteCollectionCommand } from '../../application/commands/delete-collection.command';
import { GetCollectionsQuery } from '../../application/queries/get-collections.query';
import { GetCollectionQuery } from '../../application/queries/get-collection.query';
import { PaginationDto } from '../../../shared/dtos/pagination.dto';

@ApiTags('Collections')
@Controller('collections')
export class CollectionController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
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
  @ApiOperation({ summary: 'Create collection' })
  create(@Req() req: any, @Body() createCollectionDto: CreateCollectionDto) {
    this.assertCanWrite(req);
    return this.commandBus.execute(
      new CreateCollectionCommand(createCollectionDto),
    );
  }

  @Get()
  @ApiOperation({ summary: 'Get all collections' })
  findAll(@Query() pagination: PaginationDto) {
    return this.queryBus.execute(new GetCollectionsQuery(pagination));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get collection by id' })
  findOne(@Param('id') id: string) {
    return this.queryBus.execute(new GetCollectionQuery(id));
  }

  @Patch(':id')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update collection' })
  update(
    @Param('id') id: string,
    @Req() req: any,
    @Body() updateCollectionDto: UpdateCollectionDto,
  ) {
    this.assertCanWrite(req);
    return this.commandBus.execute(
      new UpdateCollectionCommand(id, updateCollectionDto),
    );
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete collection' })
  remove(@Param('id') id: string, @Req() req: any) {
    this.assertCanWrite(req);
    return this.commandBus.execute(new DeleteCollectionCommand(id));
  }
}
