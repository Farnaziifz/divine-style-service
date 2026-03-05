import { Collection } from '@prisma/client';
import { CreateCollectionDto } from '../../presentation/dtos/create-collection.dto';
import { UpdateCollectionDto } from '../../presentation/dtos/update-collection.dto';
import { PaginationDto } from '../../../shared/dtos/pagination.dto';
import { PaginatedResult } from '../../../shared/interfaces/paginated-result.interface';

export interface ICollectionRepository {
  create(
    data: CreateCollectionDto & { slug: string; image?: string },
  ): Promise<Collection>;
  findAll(pagination?: PaginationDto): Promise<PaginatedResult<Collection>>;
  findById(id: string): Promise<Collection | null>;
  update(
    id: string,
    data: UpdateCollectionDto & { slug: string; image?: string },
  ): Promise<Collection>;
  remove(id: string): Promise<Collection>;
}
