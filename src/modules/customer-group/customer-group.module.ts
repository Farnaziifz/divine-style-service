import { Module } from '@nestjs/common';
import { SharedModule } from '../shared/shared.module';
import { CustomerGroupController } from './customer-group.controller';
import { CustomerGroupService } from './customer-group.service';

@Module({
  imports: [SharedModule],
  controllers: [CustomerGroupController],
  providers: [CustomerGroupService],
  exports: [CustomerGroupService],
})
export class CustomerGroupModule {}
