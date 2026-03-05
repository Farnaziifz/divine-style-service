import { PartialType } from '@nestjs/swagger';
import { CreateSpecificationKeyDto } from './create-specification-key.dto';

export class UpdateSpecificationKeyDto extends PartialType(
  CreateSpecificationKeyDto,
) {}
