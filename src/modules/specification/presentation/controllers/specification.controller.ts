import { Controller, Get, Post, Body } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SpecificationService } from '../../application/services/specification.service';
import { CreateSpecificationKeyDto } from '../dtos/create-specification-key.dto';

@ApiTags('Specifications')
@Controller('specifications')
export class SpecificationController {
  constructor(private readonly specificationService: SpecificationService) {}

  @Post()
  create(@Body() createDto: CreateSpecificationKeyDto) {
    return this.specificationService.create(createDto);
  }

  @Get()
  findAll() {
    return this.specificationService.findAll();
  }
}
