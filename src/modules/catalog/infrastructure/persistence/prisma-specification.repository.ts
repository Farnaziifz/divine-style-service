import { Injectable } from '@nestjs/common';
import { ISpecificationRepository } from '../../domain/repositories/specification.repository.interface';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { SpecificationKey } from '@prisma/client';
import { CreateSpecificationKeyDto } from '../../presentation/dtos/create-specification-key.dto';
import { UpdateSpecificationKeyDto } from '../../presentation/dtos/update-specification-key.dto';

@Injectable()
export class PrismaSpecificationRepository implements ISpecificationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createKey(data: CreateSpecificationKeyDto): Promise<SpecificationKey> {
    return this.prisma.specificationKey.create({
      data: {
        key: data.key,
        label: data.label,
        type: data.type,
        options: data.options,
      },
    });
  }

  async findAllKeys(): Promise<SpecificationKey[]> {
    return this.prisma.specificationKey.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateKey(
    id: string,
    data: UpdateSpecificationKeyDto,
  ): Promise<SpecificationKey> {
    return this.prisma.specificationKey.update({
      where: { id },
      data: {
        key: data.key,
        label: data.label,
        type: data.type,
        options: data.options,
      },
    });
  }

  async deleteKey(id: string): Promise<SpecificationKey> {
    return this.prisma.specificationKey.delete({
      where: { id },
    });
  }
}
