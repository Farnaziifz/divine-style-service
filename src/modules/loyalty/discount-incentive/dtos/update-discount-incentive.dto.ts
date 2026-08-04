import { PartialType } from '@nestjs/swagger';
import { CreateDiscountIncentiveDto } from './create-discount-incentive.dto';

export class UpdateDiscountIncentiveDto extends PartialType(
  CreateDiscountIncentiveDto,
) {}
