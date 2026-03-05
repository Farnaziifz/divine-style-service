import { CreateSpecificationKeyDto } from '../../presentation/dtos/create-specification-key.dto';

export class CreateSpecificationKeyCommand {
  constructor(public readonly dto: CreateSpecificationKeyDto) {}
}
