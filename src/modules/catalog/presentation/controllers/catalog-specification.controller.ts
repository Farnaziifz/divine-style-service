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

  @Post()
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create specification key' })
  create(@Body() createDto: CreateSpecificationKeyDto) {
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
    @Body() updateDto: UpdateSpecificationKeyDto,
  ) {
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
  remove(@Param('id') id: string) {
    return this.commandBus.execute(new DeleteSpecificationKeyCommand(id));
  }
}
