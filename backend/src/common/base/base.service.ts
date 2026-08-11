import { NotFoundException, Logger } from '@nestjs/common';
import { BaseEntity } from './base.entity';
import { BaseRepository, FindAllOptions } from './base.repository';

export abstract class BaseService<T extends BaseEntity> {
  protected readonly logger: Logger;

  constructor(
    protected readonly repository: BaseRepository<T>,
    protected readonly entityName: string,
  ) {
    this.logger = new Logger(entityName);
  }

  async findById(id: string): Promise<T> {
    const entity = await this.repository.findById(id);
    if (!entity) {
      throw new NotFoundException(`${this.entityName} with ID ${id} not found`);
    }
    return entity;
  }

  async findAll(options?: FindAllOptions): Promise<T[]> {
    return this.repository.findAll(options);
  }

  async count(where?: Record<string, unknown>): Promise<number> {
    return this.repository.count({ where });
  }

  async create(data: Partial<T>): Promise<T> {
    this.logger.log(`Creating ${this.entityName}`);
    return this.repository.create(data);
  }

  async update(id: string, data: Partial<T>): Promise<T> {
    await this.findById(id);
    this.logger.log(`Updating ${this.entityName} with ID ${id}`);
    return this.repository.update(id, data);
  }

  async softDelete(id: string): Promise<void> {
    await this.findById(id);
    this.logger.log(`Soft deleting ${this.entityName} with ID ${id}`);
    return this.repository.softDelete(id);
  }

  async hardDelete(id: string): Promise<void> {
    await this.findById(id);
    this.logger.log(`Hard deleting ${this.entityName} with ID ${id}`);
    return this.repository.hardDelete(id);
  }
}
