import { UpdateSpecificationKeyDto } from '../../presentation/dtos/update-specification-key.dto';

export class UpdateSpecificationKeyCommand {
  constructor(
    public readonly id: string,
    public readonly dto: UpdateSpecificationKeyDto,
  ) {}
}
