export interface IRepository<T> {
  findById(id: string): Promise<T | null>;
  findAll(options?: FindAllOptions): Promise<T[]>;
  create(data: Partial<T>): Promise<T>;
  update(id: string, data: Partial<T>): Promise<T>;
  softDelete(id: string): Promise<void>;
  hardDelete(id: string): Promise<void>;
  count(options?: CountOptions): Promise<number>;
  exists(id: string): Promise<boolean>;
}

export interface IService<T> {
  findById(id: string): Promise<T>;
  findAll(options?: FindAllOptions): Promise<T[]>;
  create(data: Partial<T>): Promise<T>;
  update(id: string, data: Partial<T>): Promise<T>;
  softDelete(id: string): Promise<void>;
  hardDelete(id: string): Promise<void>;
  count(where?: Record<string, unknown>): Promise<number>;
}

export interface IController<T> {
  findAll(query: unknown): Promise<{ data: T[]; meta: unknown }>;
  findOne(id: string): Promise<T>;
  create(data: unknown): Promise<T>;
  update(id: string, data: unknown): Promise<T>;
  remove(id: string): Promise<void>;
}

export interface FindAllOptions {
  skip?: number;
  take?: number;
  orderBy?: Record<string, 'asc' | 'desc'>;
  where?: Record<string, unknown>;
  include?: Record<string, unknown>;
  select?: Record<string, unknown>;
}

export interface CountOptions {
  where?: Record<string, unknown>;
}

export interface CreateOptions {
  include?: Record<string, unknown>;
  select?: Record<string, unknown>;
}

export interface UpdateOptions {
  include?: Record<string, unknown>;
  select?: Record<string, unknown>;
}
