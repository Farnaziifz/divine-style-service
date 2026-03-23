import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Req,
  ForbiddenException,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { CreateSpecificationKeyDto } from '../dtos/create-specification-key.dto';
import { UpdateSpecificationKeyDto } from '../dtos/update-specification-key.dto';
import { CreateSpecificationKeyCommand } from '../../application/commands/create-specification-key.command';
import { UpdateSpecificationKeyCommand } from '../../application/commands/update-specification-key.command';
import { DeleteSpecificationKeyCommand } from '../../application/commands/delete-specification-key.command';
import { GetSpecificationKeysQuery } from '../../application/queries/get-specification-keys.query';

@ApiTags('Specifications')
@Controller('specifications')
export class CatalogSpecificationController {
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
  @ApiOperation({ summary: 'Create specification key' })
  create(@Req() req: any, @Body() createDto: CreateSpecificationKeyDto) {
    this.assertCanWrite(req);
    return this.commandBus.execute(
      new CreateSpecificationKeyCommand(createDto),
    );
  }

  @Get()
  @ApiOperation({ summary: 'Get all specification keys' })
  findAll() {
    return this.queryBus.execute(new GetSpecificationKeysQuery());
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return { id };
  }

  @Patch(':id')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update specification key' })
  async update(
    @Param('id') id: string,
    @Req() req: any,
    @Body() updateDto: UpdateSpecificationKeyDto,
  ) {
    this.assertCanWrite(req);
    console.log('Controller: Update spec called', id, updateDto);
    try {
      const result = await this.commandBus.execute(
        new UpdateSpecificationKeyCommand(id, updateDto),
      );
      console.log('Controller: Update result', result);
      return result;
    } catch (error) {
      console.error('Controller: Update error', error);
      throw error;
    }
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete specification key' })
  remove(@Param('id') id: string, @Req() req: any) {
    this.assertCanWrite(req);
    return this.commandBus.execute(new DeleteSpecificationKeyCommand(id));
  }
}
