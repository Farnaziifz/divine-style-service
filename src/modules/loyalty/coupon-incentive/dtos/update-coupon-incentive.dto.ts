import { PartialType } from '@nestjs/swagger';
import { CreateCouponIncentiveDto } from './create-coupon-incentive.dto';

export class UpdateCouponIncentiveDto extends PartialType(
  CreateCouponIncentiveDto,
) {}
