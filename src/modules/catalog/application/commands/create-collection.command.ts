import { CreateCollectionDto } from '../../presentation/dtos/create-collection.dto';

export class CreateCollectionCommand {
  constructor(public readonly dto: CreateCollectionDto) {}
}
