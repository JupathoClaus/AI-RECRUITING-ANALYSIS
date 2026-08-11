import { Module } from '@nestjs/common';
import { DatabaseModule } from '@database/database.module';
import { OrganizationModule } from '../organization/organization.module';
import { DepartmentsController } from './departments.controller';
import { DepartmentsService } from './departments.service';

@Module({
  imports: [DatabaseModule, OrganizationModule],
  controllers: [DepartmentsController],
  providers: [DepartmentsService],
  exports: [DepartmentsService],
})
export class DepartmentsModule {}
