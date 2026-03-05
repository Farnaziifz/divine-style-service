import { SpecificationKey } from '@prisma/client';
import { CreateSpecificationKeyDto } from '../../presentation/dtos/create-specification-key.dto';
import { UpdateSpecificationKeyDto } from '../../presentation/dtos/update-specification-key.dto';

export interface ISpecificationRepository {
  createKey(data: CreateSpecificationKeyDto): Promise<SpecificationKey>;
  findAllKeys(): Promise<SpecificationKey[]>;
  updateKey(
    id: string,
    data: UpdateSpecificationKeyDto,
  ): Promise<SpecificationKey>;
  deleteKey(id: string): Promise<SpecificationKey>;
}
