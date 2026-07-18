import { Get, Post, Put, Delete, Param, Body, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { BaseEntity } from './base.entity';
import { BaseService } from './base.service';
import { PaginationDto } from '../dto/pagination.dto';

@ApiTags('Base')
export abstract class BaseController<T extends BaseEntity> {
  constructor(
    protected readonly service: BaseService<T>,
    protected readonly entityName: string,
  ) {}

  @Get()
  @ApiOperation({ summary: `Get all entities` })
  @ApiResponse({ status: 200, description: `Return all entities` })
  async findAll(@Query() paginationDto: PaginationDto) {
    const { skip, take, orderBy, order } = paginationDto;
    const orderByObj = orderBy ? { [orderBy]: (order || 'asc') as 'asc' | 'desc' } : undefined;
    const [data, total] = await Promise.all([
      this.service.findAll({ skip, take, orderBy: orderByObj }),
      this.service.count(),
    ]);

    return {
      data,
      meta: {
        total,
        skip: skip || 0,
        take: take || 10,
        hasNext: (skip || 0) + (take || 10) < total,
      },
    };
  }

  @Get(':id')
  @ApiOperation({ summary: `Get entity by ID` })
  @ApiResponse({ status: 200, description: `Return entity by ID` })
  @ApiResponse({ status: 404, description: `Entity not found` })
  async findOne(@Param('id') id: string) {
    return this.service.findById(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: `Create entity` })
  @ApiResponse({ status: 201, description: `Entity created` })
  async create(@Body() createDto: Partial<T>) {
    return this.service.create(createDto);
  }

  @Put(':id')
  @ApiOperation({ summary: `Update entity` })
  @ApiResponse({ status: 200, description: `Entity updated` })
  @ApiResponse({ status: 404, description: `Entity not found` })
  async update(@Param('id') id: string, @Body() updateDto: Partial<T>) {
    return this.service.update(id, updateDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: `Delete entity` })
  @ApiResponse({ status: 204, description: `Entity deleted` })
  @ApiResponse({ status: 404, description: `Entity not found` })
  async remove(@Param('id') id: string) {
    return this.service.softDelete(id);
  }
}
