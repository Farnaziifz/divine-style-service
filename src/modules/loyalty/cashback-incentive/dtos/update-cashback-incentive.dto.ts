import { PartialType } from '@nestjs/swagger';
import { CreateCashbackIncentiveDto } from './create-cashback-incentive.dto';

export class UpdateCashbackIncentiveDto extends PartialType(
  CreateCashbackIncentiveDto,
) {}
