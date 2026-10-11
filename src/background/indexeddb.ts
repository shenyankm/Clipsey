import {
  DB_CONFIG,
  CLIP_URL_KEY,
  STORE_CONFIGS,
  IndexedDBError,
  type DBSchema,
  type QueryOptions,
  type BulkOperationOptions,
  type TransactionMode,
  type StoreConfig
} from '@/types/indexeddb';
import type { Clip } from '@/types/clip';
import { withClipUrlKey } from './storage/utils/clip-url-record';
import { createIndexKeys } from './storage/utils/url-normalizer';

// IndexedDB 操作层：连接、升级、事务与基础 CRUD 封装
export class IndexedDB {
  private db: IDBDatabase | null = null;
  private dbPromise: Promise<IDBDatabase> | null = null;

  private constructor() {}

  static async create(dbName: string, version: number): Promise<IndexedDB> {
    const instance = new IndexedDB();
    await instance.init();
    return instance;
  }

  isInitialized(): boolean {
    return this.db !== null;
  }

  async init(): Promise<void> {
    await this.getDB();
  }

  // 打开数据库并处理版本升级
  private openDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_CONFIG.name, DB_CONFIG.version);

      request.onerror = () => {
        reject(new IndexedDBError('Failed to open database', 'DB_OPEN_ERROR', request.error || undefined));
      };

      request.onsuccess = () => {
        this.db = request.result;
        this.setupErrorHandlers();
        resolve(request.result);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        const tx = (event.target as IDBOpenDBRequest).transaction!;
        try {
          this.upgradeDatabase(db, event.oldVersion, event.newVersion || DB_CONFIG.version, tx);
        } catch {
          tx.abort();
        }
      };
    });
  }

  // 升级保留公开数据和未知 store，仅退役已确认属于旧版本的派生数据。
  private upgradeDatabase(db: IDBDatabase, oldVersion: number, newVersion: number, tx: IDBTransaction): void {
    console.log(`Upgrading database from version ${oldVersion} to ${newVersion}`);

    if (oldVersion > 0 && oldVersion < 5 && db.objectStoreNames.contains('clips') && tx.objectStore('clips').indexNames.contains('urlKey')) {
      throw new Error('URL index name already exists');
    }

    STORE_CONFIGS.forEach(storeConfig => {
      const hasStore = db.objectStoreNames.contains(storeConfig.name);
      let store: IDBObjectStore;
      if (!hasStore) {
        store = db.createObjectStore(storeConfig.name, {
          keyPath: storeConfig.keyPath,
          autoIncrement: storeConfig.autoIncrement
        });
      } else {
        store = tx.objectStore(storeConfig.name);
      }

      const existingIndexes = new Set<string>(Array.from(store.indexNames));
      for (const indexConfig of storeConfig.indexes) {
        if (!existingIndexes.has(indexConfig.name)) {
          store.createIndex(indexConfig.name, indexConfig.keyPath, indexConfig.options);
        }
      }
    });

    if (oldVersion > 0 && oldVersion < 5) {
      const store = tx.objectStore('clips');
      const backfill = () => {
        if (store.keyPath !== 'id') return;
        const request = store.openCursor();
        request.onerror = () => tx.abort();
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor) return;
          try {
            cursor.update(withClipUrlKey(cursor.value, cursor.primaryKey));
            cursor.continue();
          } catch { tx.abort(); }
        };
      };
      if (oldVersion === 4 && db.objectStoreNames.contains('clipUrls')) {
        const legacy = tx.objectStore('clipUrls');
        if (legacy.keyPath !== 'id' || legacy.autoIncrement || legacy.indexNames.length !== 1 ||
            !legacy.indexNames.contains('urlKey') || legacy.index('urlKey').keyPath !== 'key' ||
            legacy.index('urlKey').unique || legacy.index('urlKey').multiEntry) throw new Error('Unknown legacy URL store');
        const request = legacy.openCursor();
        request.onerror = () => tx.abort();
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor) { db.deleteObjectStore('clipUrls'); backfill(); return; }
          try {
            const row = cursor.value;
            const key = row?.key;
            const known = row && typeof row === 'object' && !Array.isArray(row) &&
              Object.keys(row).every(name => name === 'id' || name === 'key') && indexedDB.cmp(row.id, cursor.primaryKey) === 0 &&
              (key === undefined || (Array.isArray(key) && Object.keys(key).length === key.length && ((key.length === 1 && key[0] === '') ||
                (key.length === 3 && typeof key[0] === 'string' && typeof key[1] === 'string' &&
                 typeof row.id === 'string' && key[2] === row.id && createIndexKeys(key[0]).at(-1) === key[0]))));
            if (!known) { tx.abort(); return; }
            cursor.continue();
          } catch { tx.abort(); }
        };
      } else backfill();
    }
  }

  // 确保 store 结构与配置一致：如已存在则删除后重建索引
  private createObjectStore(db: IDBDatabase, config: StoreConfig): void {
    const store = db.createObjectStore(config.name, {
      keyPath: config.keyPath,
      autoIncrement: config.autoIncrement
    });
    config.indexes.forEach(indexConfig => {
      store.createIndex(indexConfig.name, indexConfig.keyPath, indexConfig.options);
    });
    console.log(`Created object store: ${config.name} with ${config.indexes.length} indexes`);
  }

  // 数据库错误与版本变更的统一处理
  private setupErrorHandlers(): void {
    if (!this.db) return;

    this.db.onerror = (event) => {
      console.error('Database error:', event);
    };

    this.db.onversionchange = () => {
      this.db?.close();
      this.db = null;
      this.dbPromise = null;
      console.warn('Database version changed, connection closed');
    };
  }

  private async getDB(): Promise<IDBDatabase> {
    if (this.db && this.db.version === DB_CONFIG.version) {
      return this.db;
    }

    if (!this.dbPromise) {
      this.dbPromise = this.openDatabase().catch(error => {
        this.dbPromise = null;
        throw error;
      });
    }

    return this.dbPromise;
  }

  private async createTransaction(
    storeNames: string | string[],
    mode: TransactionMode = 'readonly'
  ): Promise<IDBTransaction> {
    const db = await this.getDB();
    return db.transaction(storeNames, mode);
  }

  // 统一事务包装：执行操作并等待 oncomplete，发生异常时主动 abort
  async executeTransaction<T>(
    storeNames: string | string[],
    mode: TransactionMode,
    operation: (transaction: IDBTransaction) => Promise<T>
  ): Promise<T> {
    const transaction = await this.createTransaction(storeNames, mode);
    const completed = new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('Transaction failed'));
      transaction.onabort = () => reject(transaction.error ?? new Error('Transaction aborted'));
    });

    try {
      const [result] = await Promise.all([
        Promise.resolve().then(() => operation(transaction)),
        completed
      ]);
      return result;
    } catch (error) {
      // 事务可能已自动回滚，不能让再次 abort 的异常覆盖原始错误。
      try { transaction.abort(); } catch {}
      throw error;
    }
  }

  // 派生键随正文写入，索引由 IndexedDB 原子维护。
  static writeRecord(store: IDBObjectStore, operation: 'add' | 'put', data: unknown): IDBRequest {
    if (store.name === 'clips' && store.keyPath === 'id' && data && typeof data === 'object') data = withClipUrlKey(data as Clip);
    return store[operation](data);
  }

  static readRecord<T>(store: IDBObjectStore, value: T): T {
    // 原生请求已创建独立对象，移除私有字段无需再次复制正文。
    if (store.name === 'clips' && store.keyPath === 'id' && value && typeof value === 'object') Reflect.deleteProperty(value, CLIP_URL_KEY);
    return value;
  }

  async add<K extends keyof DBSchema>(
    storeName: K,
    data: DBSchema[K]['value']
  ): Promise<DBSchema[K]['key']> {
    return this.executeTransaction(storeName as string, 'readwrite', async (transaction) => {
      const store = transaction.objectStore(storeName as string);
      
      return new Promise<DBSchema[K]['key']>((resolve, reject) => {
        const request = IndexedDB.writeRecord(store, 'add', data);
        
        request.onsuccess = () => {
          resolve(request.result as DBSchema[K]['key']);
        };
        
        request.onerror = () => {
          reject(new IndexedDBError(
            'Failed to add record',
            'ADD_ERROR',
            request.error || undefined
          ));
        };
      });
    });
  }

  async put<K extends keyof DBSchema>(
    storeName: K,
    data: DBSchema[K]['value']
  ): Promise<DBSchema[K]['key']> {
    return this.executeTransaction(storeName as string, 'readwrite', async (transaction) => {
      const store = transaction.objectStore(storeName as string);
      
      return new Promise<DBSchema[K]['key']>((resolve, reject) => {
        const request = IndexedDB.writeRecord(store, 'put', data);
        
        request.onsuccess = () => {
          resolve(request.result as DBSchema[K]['key']);
        };
        
        request.onerror = () => {
          reject(new IndexedDBError(
            'Failed to put record',
            'PUT_ERROR',
            request.error || undefined
          ));
        };
      });
    });
  }

  async get<K extends keyof DBSchema>(
    storeName: K,
    key: DBSchema[K]['key']
  ): Promise<DBSchema[K]['value'] | undefined> {
    return this.executeTransaction(storeName as string, 'readonly', async (transaction) => {
      const store = transaction.objectStore(storeName as string);
      
      return new Promise<DBSchema[K]['value'] | undefined>((resolve, reject) => {
        const request = store.get(key);
        
        request.onsuccess = () => {
          resolve(IndexedDB.readRecord(store, request.result));
        };
        
        request.onerror = () => {
          reject(new IndexedDBError(
            'Failed to get record',
            'GET_ERROR',
            request.error || undefined
          ));
        };
      });
    });
  }

  async delete<K extends keyof DBSchema>(
    storeName: K,
    key: DBSchema[K]['key']
  ): Promise<void> {
    return this.executeTransaction(storeName as string, 'readwrite', async (transaction) => {
      const store = transaction.objectStore(storeName as string);
      
      return new Promise<void>((resolve, reject) => {
        const request = store.delete(key);
        
        request.onsuccess = () => {
          resolve();
        };
        
        request.onerror = () => {
          reject(new IndexedDBError(
            'Failed to delete record',
            'DELETE_ERROR',
            request.error || undefined
          ));
        };
      });
    });
  }

  async clear<K extends keyof DBSchema>(storeName: K): Promise<void> {
    return this.executeTransaction(storeName as string, 'readwrite', async (transaction) => {
      const store = transaction.objectStore(storeName as string);
      
      return new Promise<void>((resolve, reject) => {
        const request = store.clear();
        
        request.onsuccess = () => {
          resolve();
        };
        
        request.onerror = () => {
          reject(new IndexedDBError(
            'Failed to clear store',
            'CLEAR_ERROR',
            request.error || undefined
          ));
        };
      });
    });
  }

  async count<K extends keyof DBSchema>(
    storeName: K,
    query?: IDBValidKey | IDBKeyRange
  ): Promise<number> {
    return this.executeTransaction(storeName as string, 'readonly', async (transaction) => {
      const store = transaction.objectStore(storeName as string);
      
      return new Promise<number>((resolve, reject) => {
        const request = store.count(query);
        
        request.onsuccess = () => {
          resolve(request.result);
        };
        
        request.onerror = () => {
          reject(new IndexedDBError(
            'Failed to count records',
            'COUNT_ERROR',
            request.error || undefined
          ));
        };
      });
    });
  }

  // 关闭数据库连接
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.dbPromise = null;
    }
  }

  // 删除数据库（实例）
  async deleteDatabase(): Promise<void> {
    this.close();
    return IndexedDB.deleteDatabase();
  }

  // 删除数据库（静态）
  static async deleteDatabase(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase(DB_CONFIG.name);
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
      request.onblocked = () => {
        console.warn('Database deletion blocked');
        // 可以选择强制关闭连接或等待
        setTimeout(() => resolve(), 1000);
      };
    });
  }

  async getAllData<K extends keyof DBSchema>(
    storeName: K,
    query?: IDBValidKey | IDBKeyRange
  ): Promise<DBSchema[K]['value'][]> {
    return this.executeTransaction(storeName as string, 'readonly', async (transaction) => {
      const store = transaction.objectStore(storeName as string);
      
      return new Promise<DBSchema[K]['value'][]>((resolve, reject) => {
        const request = store.getAll(query);
        
        request.onsuccess = () => {
          resolve(request.result.map(value => IndexedDB.readRecord(store, value)));
        };
        
        request.onerror = () => {
          reject(new IndexedDBError(
            'Failed to get all records',
            'GET_ALL_ERROR',
            request.error || undefined
          ));
        };
      });
    });
  }

  async deleteData<K extends keyof DBSchema>(
    storeName: K,
    key: DBSchema[K]['key']
  ): Promise<void> {
    return this.executeTransaction(storeName as string, 'readwrite', async (transaction) => {
      const store = transaction.objectStore(storeName as string);
      
      return new Promise<void>((resolve, reject) => {
        const request = store.delete(key);
        
        request.onsuccess = () => {
          resolve();
        };
        
        request.onerror = () => {
          reject(new IndexedDBError(
            'Failed to delete record',
            'DELETE_ERROR',
            request.error || undefined
          ));
        };
      });
    });
  }
}

// 提供一个可用的管理器门面，按需初始化并代理所有方法
// 由于构造函数是私有的，这里通过静态 create 保证实例化和初始化
let instance: IndexedDB | null = null;
let instancePromise: Promise<IndexedDB> | null = null;

async function getInstance(): Promise<IndexedDB> {
  if (instance) return instance;
  if (!instancePromise) {
    instancePromise = IndexedDB.create(DB_CONFIG.name, DB_CONFIG.version).then((inst) => {
      instance = inst;
      return inst;
    }).catch(error => {
      instancePromise = null;
      throw error;
    });
  }
  return instancePromise;
}

export const indexedDBManager = {
  isInitialized(): boolean {
    return !!instance && instance.isInitialized();
  },

  async init(): Promise<void> {
    const inst = await getInstance();
    await inst.init();
  },

  async executeTransaction<T>(
    storeNames: string | string[],
    mode: TransactionMode,
    operation: (transaction: IDBTransaction) => Promise<T>
  ): Promise<T> {
    const inst = await getInstance();
    return inst.executeTransaction(storeNames, mode, operation);
  },

  async add<K extends keyof DBSchema>(
    storeName: K,
    data: DBSchema[K]['value']
  ): Promise<DBSchema[K]['key']> {
    const inst = await getInstance();
    return inst.add(storeName, data);
  },

  async put<K extends keyof DBSchema>(
    storeName: K,
    data: DBSchema[K]['value']
  ): Promise<DBSchema[K]['key']> {
    const inst = await getInstance();
    return inst.put(storeName, data);
  },

  async get<K extends keyof DBSchema>(
    storeName: K,
    key: DBSchema[K]['key']
  ): Promise<DBSchema[K]['value'] | undefined> {
    const inst = await getInstance();
    return inst.get(storeName, key);
  },

  async delete<K extends keyof DBSchema>(
    storeName: K,
    key: DBSchema[K]['key']
  ): Promise<void> {
    const inst = await getInstance();
    return inst.delete(storeName, key);
  },

  async clear<K extends keyof DBSchema>(storeName: K): Promise<void> {
    const inst = await getInstance();
    return inst.clear(storeName);
  },

  async count<K extends keyof DBSchema>(
    storeName: K,
    query?: IDBValidKey | IDBKeyRange
  ): Promise<number> {
    const inst = await getInstance();
    return inst.count(storeName, query);
  },

  close(): void {
    if (instance) {
      instance.close();
      instance = null;
      instancePromise = null;
    }
  },

  async deleteDatabase(): Promise<void> {
    const inst = await getInstance();
    return inst.deleteDatabase();
  },

  async getAllData<K extends keyof DBSchema>(
    storeName: K,
    query?: IDBValidKey | IDBKeyRange
  ): Promise<DBSchema[K]['value'][]> {
    const inst = await getInstance();
    return inst.getAllData(storeName, query);
  },

  async deleteData<K extends keyof DBSchema>(
    storeName: K,
    key: DBSchema[K]['key']
  ): Promise<void> {
    const inst = await getInstance();
    return inst.deleteData(storeName, key);
  }
};
