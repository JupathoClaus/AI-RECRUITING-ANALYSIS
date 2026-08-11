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
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse, ApiParam } from '@nestjs/swagger';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { PermissionsGuard } from '@modules/auth/guards/permissions.guard';
import { RequirePermissions } from '@modules/auth/decorators/permissions.decorator';
import { CurrentUser } from '@modules/auth/decorators/current-user.decorator';
import { AuthenticatedPrincipal } from '@modules/auth/interfaces/auth.interface';
import { DepartmentsService } from './departments.service';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';
import { DepartmentQueryDto } from './dto/department-query.dto';

@ApiTags('Departments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('departments')
export class DepartmentsController {
  constructor(private readonly departmentsService: DepartmentsService) {}

  @Post()
  @RequirePermissions('departments.create')
  @ApiOperation({ summary: 'Create a new department' })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'Department created' })
  @ApiResponse({ status: HttpStatus.CONFLICT, description: 'Duplicate name or code' })
  async create(@Body() dto: CreateDepartmentDto, @CurrentUser() user: AuthenticatedPrincipal) {
    return this.departmentsService.create(user.activeCompanyId!, dto, user.userId);
  }

  @Get()
  @RequirePermissions('departments.read')
  @ApiOperation({ summary: 'List departments with pagination' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Paginated department list' })
  async findAll(@Query() query: DepartmentQueryDto, @CurrentUser() user: AuthenticatedPrincipal) {
    return this.departmentsService.findAll(user.activeCompanyId!, query);
  }

  @Get('tree')
  @RequirePermissions('departments.read')
  @ApiOperation({ summary: 'Get department hierarchy tree' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Department tree' })
  async getTree(@CurrentUser() user: AuthenticatedPrincipal) {
    return this.departmentsService.getTree(user.activeCompanyId!);
  }

  @Get(':departmentId')
  @RequirePermissions('departments.read')
  @ApiOperation({ summary: 'Get a single department' })
  @ApiParam({ name: 'departmentId', description: 'Department ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Department details' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Department not found' })
  async findById(
    @Param('departmentId') departmentId: string,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.departmentsService.findById(user.activeCompanyId!, departmentId);
  }

  @Patch(':departmentId')
  @RequirePermissions('departments.update')
  @ApiOperation({ summary: 'Update a department' })
  @ApiParam({ name: 'departmentId', description: 'Department ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Department updated' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Department not found' })
  async update(
    @Param('departmentId') departmentId: string,
    @Body() dto: UpdateDepartmentDto,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.departmentsService.update(user.activeCompanyId!, departmentId, dto, user.userId);
  }

  @Delete(':departmentId')
  @RequirePermissions('departments.delete')
  @ApiOperation({ summary: 'Soft delete a department' })
  @ApiParam({ name: 'departmentId', description: 'Department ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Department deleted' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Department not found' })
  async remove(
    @Param('departmentId') departmentId: string,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.departmentsService.softDelete(user.activeCompanyId!, departmentId);
  }

  @Post(':departmentId/archive')
  @RequirePermissions('departments.update')
  @ApiOperation({ summary: 'Archive a department' })
  @ApiParam({ name: 'departmentId', description: 'Department ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Department archived' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Department not found' })
  async archive(
    @Param('departmentId') departmentId: string,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.departmentsService.archive(user.activeCompanyId!, departmentId, user.userId);
  }

  @Post(':departmentId/restore')
  @RequirePermissions('departments.update')
  @ApiOperation({ summary: 'Restore an archived department' })
  @ApiParam({ name: 'departmentId', description: 'Department ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Department restored' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Department not found' })
  async restore(
    @Param('departmentId') departmentId: string,
    @CurrentUser() user: AuthenticatedPrincipal,
  ) {
    return this.departmentsService.restore(user.activeCompanyId!, departmentId, user.userId);
  }
}
