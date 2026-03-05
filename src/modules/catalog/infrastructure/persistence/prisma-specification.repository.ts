import { Injectable } from '@nestjs/common';
import { ISpecificationRepository } from '../../domain/repositories/specification.repository.interface';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { SpecificationKey } from '@prisma/client';
import { CreateSpecificationKeyDto } from '../../presentation/dtos/create-specification-key.dto';

@Injectable()
export class PrismaSpecificationRepository implements ISpecificationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateSpecificationKeyDto): Promise<SpecificationKey> {
    return this.prisma.specificationKey.create({ data });
  }

  async findAll(): Promise<SpecificationKey[]> {
    return this.prisma.specificationKey.findMany();
  }
}
