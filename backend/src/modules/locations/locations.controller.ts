import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';

import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '@modules/auth/guards/permissions.guard';
import { RequirePermissions } from '@modules/auth/decorators/permissions.decorator';
import { CurrentUser } from '@modules/auth/decorators/current-user.decorator';
import { AuthenticatedPrincipal } from '@modules/auth/interfaces/auth.interface';

import { LocationsService } from './locations.service';
import { CreateLocationDto } from './dto/create-location.dto';
import { UpdateLocationDto } from './dto/update-location.dto';
import { LocationQueryDto } from './dto/location-query.dto';

@ApiTags('Company Locations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('company/locations')
export class LocationsController {
  constructor(private readonly locationsService: LocationsService) {}

  @Post()
  @RequirePermissions('locations.create')
  @ApiOperation({ summary: 'Create a new company location' })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'Location created' })
  async create(@Body() dto: CreateLocationDto, @CurrentUser() user: AuthenticatedPrincipal) {
    const companyId = user.activeCompanyId!;
    return this.locationsService.create(companyId, dto, user.userId);
  }

  @Get()
  @RequirePermissions('locations.read')
  @ApiOperation({ summary: 'List company locations' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Paginated list of locations' })
  async findAll(@Query() query: LocationQueryDto, @CurrentUser() user: AuthenticatedPrincipal) {
    const companyId = user.activeCompanyId!;
    return this.locationsService.findAll(companyId, query);
  }

  @Get(':locationId')
  @RequirePermissions('locations.read')
  @ApiOperation({ summary: 'Get a single location' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Location details' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Location not found' })
  async findById(
    @Param('locationId') locationId: string,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    const companyId = user.activeCompanyId!;
    return this.locationsService.findById(companyId, locationId);
  }

  @Patch(':locationId')
  @RequirePermissions('locations.update')
  @ApiOperation({ summary: 'Update a location' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Location updated' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Location not found' })
  async update(
    @Param('locationId') locationId: string,
    @Body() dto: UpdateLocationDto,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    const companyId = user.activeCompanyId!;
    return this.locationsService.update(companyId, locationId, dto, user.userId);
  }

  @Delete(':locationId')
  @RequirePermissions('locations.delete')
  @ApiOperation({ summary: 'Soft delete a location' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Location soft deleted' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Location not found' })
  async remove(
    @Param('locationId') locationId: string,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    const companyId = user.activeCompanyId!;
    return this.locationsService.softDelete(companyId, locationId);
  }

  @Post(':locationId/set-primary')
  @RequirePermissions('locations.update')
  @ApiOperation({ summary: 'Set a location as primary' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Location set as primary' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Location not found' })
  async setPrimary(
    @Param('locationId') locationId: string,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    const companyId = user.activeCompanyId!;
    return this.locationsService.setPrimary(companyId, locationId, user.userId);
  }

  @Post(':locationId/archive')
  @RequirePermissions('locations.update')
  @ApiOperation({ summary: 'Archive a location' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Location archived' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Location not found' })
  async archive(
    @Param('locationId') locationId: string,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    const companyId = user.activeCompanyId!;
    return this.locationsService.archive(companyId, locationId, user.userId);
  }

  @Post(':locationId/restore')
  @RequirePermissions('locations.update')
  @ApiOperation({ summary: 'Restore an archived location' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Location restored' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Location not found' })
  async restore(
    @Param('locationId') locationId: string,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    const companyId = user.activeCompanyId!;
    return this.locationsService.restore(companyId, locationId, user.userId);
  }
}
