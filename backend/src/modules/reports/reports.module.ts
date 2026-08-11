import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsService } from './services/reports.service';
import { CsvExportService } from './exporters/csv-export.service';

@Module({
  controllers: [ReportsController],
  providers: [ReportsService, CsvExportService],
  exports: [ReportsService, CsvExportService],
})
export class ReportsModule {}
