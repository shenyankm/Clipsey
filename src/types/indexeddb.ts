import type { Clip } from './clip';

// IndexedDB 数据库配置
export const DB_CONFIG = {
  name: 'ClipseyDB',
  version: 1,
  stores: {
    clips: 'clips',
    settings: 'settings',
    metadata: 'metadata'
  }
} as const;

// Object Store 配置
export interface DBSchema {
  clips: {
    key: string;
    value: Clip;
    indexes: {
      sourceUrl: string;
      createdAt: string;
      textContent: string;
      highlightId: string;
    };
  };
  settings: {
    key: string;
    value: SettingsRecord;
  };
  metadata: {
    key: string;
    value: MetadataRecord;
  };
}

// 设置记录类型
export interface SettingsRecord {
  key: string;
  value: any;
  updatedAt: string;
}

// 元数据记录类型
export interface MetadataRecord {
  key: string;
  value: any;
  createdAt: string;
  updatedAt: string;
}

// 查询选项
export interface QueryOptions {
  limit?: number;
  offset?: number;
  orderBy?: string;
  direction?: 'next' | 'nextunique' | 'prev' | 'prevunique' | 'asc' | 'desc';
  indexName?: string;
  query?: IDBValidKey | IDBKeyRange;
}

// 批量操作选项
export interface BulkOperationOptions {
  batchSize?: number;
  onProgress?: (processed: number, total: number) => void;
  onError?: (error: Error, item: any) => void;
}

// 事务类型
export type TransactionMode = 'readonly' | 'readwrite';

// 索引配置
export interface IndexConfig {
  name: string;
  keyPath: string | string[];
  options?: {
    unique?: boolean;
    multiEntry?: boolean;
  };
}

// Object Store 配置
export interface StoreConfig {
  name: string;
  keyPath?: string;
  autoIncrement?: boolean;
  indexes: IndexConfig[];
}

// 数据库升级配置
export const STORE_CONFIGS: StoreConfig[] = [
  {
    name: 'clips',
    keyPath: 'id',
    indexes: [
      {
        name: 'sourceUrl',
        keyPath: 'sourceUrl',
        options: { unique: false }
      },
      {
        name: 'createdAt',
        keyPath: 'createdAt',
        options: { unique: false }
      },
      {
        name: 'textContent',
        keyPath: 'textContent',
        options: { unique: false }
      },
      {
        name: 'highlightId',
        keyPath: 'highlightId',
        options: { unique: false }
      },
      {
        name: 'sourceUrl_createdAt',
        keyPath: ['sourceUrl', 'createdAt'],
        options: { unique: false }
      }
    ]
  },
  {
    name: 'settings',
    keyPath: 'key',
    indexes: [
      {
        name: 'updatedAt',
        keyPath: 'updatedAt',
        options: { unique: false }
      }
    ]
  },
  {
    name: 'metadata',
    keyPath: 'key',
    indexes: [
      {
        name: 'createdAt',
        keyPath: 'createdAt',
        options: { unique: false }
      },
      {
        name: 'updatedAt',
        keyPath: 'updatedAt',
        options: { unique: false }
      }
    ]
  }
];

// 错误类型
export class IndexedDBError extends Error {
  constructor(
    message: string,
    public code?: string,
    public originalError?: Error
  ) {
    super(message);
    this.name = 'IndexedDBError';
  }
}

// 迁移状态
export type MigrationStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'not_started';

export interface MigrationRecord {
  status: MigrationStatus;
  version: number;
  migratedAt?: string;
  recordCount?: number;
  errors?: string[];
}