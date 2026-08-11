export abstract class BaseRepository<T> {
  protected abstract readonly modelName: string;

  abstract findById(id: string): Promise<T | null>;
  abstract findAll(options?: FindAllOptions): Promise<T[]>;
  abstract create(data: Partial<T>): Promise<T>;
  abstract update(id: string, data: Partial<T>): Promise<T>;
  abstract softDelete(id: string): Promise<void>;
  abstract hardDelete(id: string): Promise<void>;
  abstract count(options?: CountOptions): Promise<number>;
}

export interface FindAllOptions {
  skip?: number;
  take?: number;
  orderBy?: Record<string, 'asc' | 'desc'>;
  where?: Record<string, unknown>;
}

export interface CountOptions {
  where?: Record<string, unknown>;
}
