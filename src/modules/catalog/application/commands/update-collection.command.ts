import { UpdateCollectionDto } from '../../presentation/dtos/update-collection.dto';

export class UpdateCollectionCommand {
  constructor(
    public readonly id: string,
    public readonly dto: UpdateCollectionDto,
  ) {}
}
