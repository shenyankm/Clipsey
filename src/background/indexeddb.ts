import {
  DB_CONFIG,
  STORE_CONFIGS,
  IndexedDBError,
  type DBSchema,
  type QueryOptions,
  type BulkOperationOptions,
  type TransactionMode,
  type StoreConfig
} from '@/types/indexeddb';

/**
 * IndexedDB 操作层基础封装
 */
export class IndexedDB {
  private db: IDBDatabase | null = null;
  private dbPromise: Promise<IDBDatabase> | null = null;

  private constructor() {
    this.initializeDB();
  }

  static async create(dbName: string, version: number): Promise<IndexedDB> {
    const instance = new IndexedDB();
    await instance.init();
    return instance;
  }

  /**
   * 检查数据库是否已初始化
   */
  isInitialized(): boolean {
    return this.db !== null;
  }

  /**
   * 公开的初始化方法
   */
  async init(): Promise<void> {
    await this.initializeDB();
  }

  /**
   * 初始化数据库连接
   */
  private async initializeDB(): Promise<void> {
    if (this.dbPromise) {
      return this.dbPromise.then(() => {});
    }

    this.dbPromise = this.openDatabase();
    await this.dbPromise;
  }

  /**
   * 打开数据库
   */
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
        this.upgradeDatabase(db, event.oldVersion, event.newVersion || DB_CONFIG.version);
      };
    });
  }

  /**
   * 数据库升级处理
   */
  private upgradeDatabase(db: IDBDatabase, oldVersion: number, newVersion: number): void {
    console.log(`Upgrading database from version ${oldVersion} to ${newVersion}`);

    // 删除旧的 object stores（如果存在）
    const existingStoreNames = Array.from(db.objectStoreNames);
    existingStoreNames.forEach(storeName => {
      if (!STORE_CONFIGS.find(config => config.name === storeName)) {
        db.deleteObjectStore(storeName);
      }
    });

    // 创建新的 object stores
    STORE_CONFIGS.forEach(storeConfig => {
      this.createObjectStore(db, storeConfig);
    });
  }

  /**
   * 创建 Object Store
   */
  private createObjectStore(db: IDBDatabase, config: StoreConfig): void {
    // 如果 store 已存在，先删除
    if (db.objectStoreNames.contains(config.name)) {
      db.deleteObjectStore(config.name);
    }

    // 创建 object store
    const store = db.createObjectStore(config.name, {
      keyPath: config.keyPath,
      autoIncrement: config.autoIncrement
    });

    // 创建索引
    config.indexes.forEach(indexConfig => {
      store.createIndex(
        indexConfig.name,
        indexConfig.keyPath,
        indexConfig.options
      );
    });

    console.log(`Created object store: ${config.name} with ${config.indexes.length} indexes`);
  }

  /**
   * 设置错误处理器
   */
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

  /**
   * 获取数据库实例
   */
  private async getDB(): Promise<IDBDatabase> {
    if (this.db && this.db.version === DB_CONFIG.version) {
      return this.db;
    }

    if (!this.dbPromise) {
      this.dbPromise = this.openDatabase();
    }

    return this.dbPromise;
  }

  /**
   * 创建事务
   */
  private async createTransaction(
    storeNames: string | string[],
    mode: TransactionMode = 'readonly'
  ): Promise<IDBTransaction> {
    const db = await this.getDB();
    const transaction = db.transaction(storeNames, mode);

    return new Promise((resolve, reject) => {
      transaction.onerror = () => {
        reject(new IndexedDBError(
          'Transaction failed',
          'TRANSACTION_ERROR',
          transaction.error || undefined
        ));
      };

      transaction.onabort = () => {
        reject(new IndexedDBError('Transaction aborted', 'TRANSACTION_ABORTED'));
      };

      resolve(transaction);
    });
  }

  /**
   * 执行事务操作
   */
  async executeTransaction<T>(
    storeNames: string | string[],
    mode: TransactionMode,
    operation: (transaction: IDBTransaction) => Promise<T>
  ): Promise<T> {
    const transaction = await this.createTransaction(storeNames, mode);
    
    try {
      const result = await operation(transaction);
      
      // 等待事务完成
      await new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(new Error('Transaction aborted'));
      });

      return result;
    } catch (error) {
      transaction.abort();
      throw error;
    }
  }

  /**
   * 添加单条记录
   */
  async add<K extends keyof DBSchema>(
    storeName: K,
    data: DBSchema[K]['value']
  ): Promise<DBSchema[K]['key']> {
    return this.executeTransaction(storeName as string, 'readwrite', async (transaction) => {
      const store = transaction.objectStore(storeName as string);
      
      return new Promise<DBSchema[K]['key']>((resolve, reject) => {
        const request = store.add(data);
        
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

  /**
   * 更新或添加记录
   */
  async put<K extends keyof DBSchema>(
    storeName: K,
    data: DBSchema[K]['value']
  ): Promise<DBSchema[K]['key']> {
    return this.executeTransaction(storeName as string, 'readwrite', async (transaction) => {
      const store = transaction.objectStore(storeName as string);
      
      return new Promise<DBSchema[K]['key']>((resolve, reject) => {
        const request = store.put(data);
        
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

  /**
   * 获取单条记录
   */
  async get<K extends keyof DBSchema>(
    storeName: K,
    key: DBSchema[K]['key']
  ): Promise<DBSchema[K]['value'] | undefined> {
    return this.executeTransaction(storeName as string, 'readonly', async (transaction) => {
      const store = transaction.objectStore(storeName as string);
      
      return new Promise<DBSchema[K]['value'] | undefined>((resolve, reject) => {
        const request = store.get(key);
        
        request.onsuccess = () => {
          resolve(request.result);
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

  /**
   * 删除记录
   */
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

  /**
   * 清空 object store
   */
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

  /**
   * 获取记录数量
   */
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

  /**
   * 关闭数据库连接
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.dbPromise = null;
    }
  }

  /**
   * 删除数据库（实例方法）
   */
  async deleteDatabase(): Promise<void> {
    this.close();
    return IndexedDB.deleteDatabase();
  }

  /**
   * 删除数据库（静态方法）
   */
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

  /**
   * 获取所有记录
   */
  async getAllData<K extends keyof DBSchema>(
    storeName: K,
    query?: IDBValidKey | IDBKeyRange
  ): Promise<DBSchema[K]['value'][]> {
    return this.executeTransaction(storeName as string, 'readonly', async (transaction) => {
      const store = transaction.objectStore(storeName as string);
      
      return new Promise<DBSchema[K]['value'][]>((resolve, reject) => {
        const request = store.getAll(query);
        
        request.onsuccess = () => {
          resolve(request.result);
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

  /**
   * 删除记录
   */
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
    });
  }
  return instancePromise;
}

export const indexedDBManager = {
  isInitialized(): boolean {
    return !!instance && instance.isInitialized();
  },

  async init(): Promise<void> {
    await getInstance();
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