import { Module } from '@nestjs/common';
import { SharedModule } from '../shared/shared.module';
import { AdminSalesReportController } from './sales-report.controller';
import { AdminOfflineSalesReportController } from './offline-sales-report.controller';

@Module({
  imports: [SharedModule],
  controllers: [AdminSalesReportController, AdminOfflineSalesReportController],
})
export class ReportsModule {}

