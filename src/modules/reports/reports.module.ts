import { Module } from '@nestjs/common';
import { SharedModule } from '../shared/shared.module';
import { AdminSalesReportController } from './sales-report.controller';

@Module({
  imports: [SharedModule],
  controllers: [AdminSalesReportController],
})
export class ReportsModule {}

