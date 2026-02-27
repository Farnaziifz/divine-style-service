import { Module } from '@nestjs/common';
import { SpecificationService } from './application/services/specification.service';
import { SpecificationController } from './presentation/controllers/specification.controller';
import { SharedModule } from '../shared/shared.module';

@Module({
  imports: [SharedModule],
  controllers: [SpecificationController],
  providers: [SpecificationService],
})
export class SpecificationModule {}
