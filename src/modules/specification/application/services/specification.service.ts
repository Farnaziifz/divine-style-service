import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { CreateSpecificationKeyDto } from '../../presentation/dtos/create-specification-key.dto';

@Injectable()
export class SpecificationService {
  constructor(private prisma: PrismaService) {}

  async create(createDto: CreateSpecificationKeyDto) {
    return this.prisma.specificationKey.create({
      data: createDto,
    });
  }

  async findAll() {
    return this.prisma.specificationKey.findMany();
  }
}
