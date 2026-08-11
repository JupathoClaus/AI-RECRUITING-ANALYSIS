import { Module } from '@nestjs/common';
import { DatabaseModule } from '@database/database.module';
import { OrganizationModule } from '../organization/organization.module';
import { LocationsService } from './locations.service';
import { LocationsController } from './locations.controller';

@Module({
  imports: [DatabaseModule, OrganizationModule],
  controllers: [LocationsController],
  providers: [LocationsService],
  exports: [LocationsService],
})
export class LocationsModule {}
