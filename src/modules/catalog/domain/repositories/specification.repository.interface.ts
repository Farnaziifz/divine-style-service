import { SpecificationKey } from '@prisma/client';
import { CreateSpecificationKeyDto } from '../../presentation/dtos/create-specification-key.dto';

export interface ISpecificationRepository {
  create(data: CreateSpecificationKeyDto): Promise<SpecificationKey>;
  findAll(): Promise<SpecificationKey[]>;
}
