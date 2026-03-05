import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { CreateSpecificationKeyDto } from '../dtos/create-specification-key.dto';
import { CreateSpecificationKeyCommand } from '../../application/commands/create-specification-key.command';
import { GetSpecificationKeysQuery } from '../../application/queries/get-specification-keys.query';

@ApiTags('Specifications')
@Controller('specifications')
export class SpecificationController {
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
}
