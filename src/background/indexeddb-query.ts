import { indexedDBManager } from './indexeddb';
import {
  IndexedDBError,
  type DBSchema,
  type QueryOptions,
  type BulkOperationOptions,
  type TransactionMode
} from '@/types/indexeddb';

/**
 * IndexedDB 高级查询和批量操作
 */
export class IndexedDBQuery {
  /**
   * 查询所有记录
   */
  static async getAll<K extends keyof DBSchema>(
    storeName: K,
    options: QueryOptions = {}
  ): Promise<DBSchema[K]['value'][]> {
    const { limit, offset = 0, indexName, query } = options;
    let direction: IDBCursorDirection = 'next';
    
    // 转换direction参数
    if (options.direction === 'desc' || options.direction === 'prev') {
      direction = 'prev';
    } else if (options.direction === 'asc' || options.direction === 'next') {
      direction = 'next';
    } else if (options.direction) {
      direction = options.direction as IDBCursorDirection;
    }

    return indexedDBManager.executeTransaction(
      storeName as string,
      'readonly',
      async (transaction) => {
        const store = transaction.objectStore(storeName as string);
        const source = indexName ? store.index(indexName) : store;

        return new Promise<DBSchema[K]['value'][]>((resolve, reject) => {
          const results: DBSchema[K]['value'][] = [];
          let count = 0;
          let skipped = 0;

          const request = source.openCursor(query, direction);

          request.onsuccess = () => {
            const cursor = request.result;

            if (!cursor) {
              resolve(results);
              return;
            }

            // 跳过 offset 数量的记录
            if (skipped < offset) {
              skipped++;
              cursor.continue();
              return;
            }

            // 检查是否达到限制
            if (limit && count >= limit) {
              resolve(results);
              return;
            }

            results.push(cursor.value);
            count++;
            cursor.continue();
          };

          request.onerror = () => {
            reject(new IndexedDBError(
              'Failed to query records',
              'QUERY_ERROR',
              request.error || undefined
            ));
          };
        });
      }
    );
  }

  /**
   * 根据索引查询记录
   */
  static async getByIndex<K extends keyof DBSchema>(
    storeName: K,
    indexName: string,
    value: IDBValidKey | IDBKeyRange,
    options: QueryOptions = {}
  ): Promise<DBSchema[K]['value'][]> {
    return this.getAll(storeName, {
      ...options,
      indexName,
      query: value
    });
  }

  /**
   * 分页查询
   */
  static async paginate<K extends keyof DBSchema>(
    storeName: K,
    page: number,
    pageSize: number,
    options: Omit<QueryOptions, 'limit' | 'offset'> = {}
  ): Promise<{
    data: DBSchema[K]['value'][];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }> {
    const offset = (page - 1) * pageSize;
    
    // 获取总数
    const total = await indexedDBManager.count(storeName, options.query);
    
    // 获取分页数据
    const data = await this.getAll(storeName, {
      ...options,
      limit: pageSize,
      offset
    });

    return {
      data,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize)
    };
  }

  /**
   * 批量添加记录
   */
  static async bulkAdd<K extends keyof DBSchema>(
    storeName: K,
    records: DBSchema[K]['value'][],
    options: BulkOperationOptions = {}
  ): Promise<DBSchema[K]['key'][]> {
    const { batchSize = 100 } = options;
    const results: DBSchema[K]['key'][] = [];
    const errors: Error[] = [];

    // 分批处理
    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);
      
      try {
        const batchResults = await this.processBatch(
          storeName,
          batch,
          'add',
          false
        );
        results.push(...batchResults);
      } catch (error) {
        errors.push(error as Error);
        // 继续处理下一批
      }
    }

    if (errors.length > 0) {
      console.warn(`Bulk add completed with ${errors.length} errors:`, errors);
    }

    return results;
  }

  /**
   * 批量更新记录
   */
  static async bulkPut<K extends keyof DBSchema>(
    storeName: K,
    records: DBSchema[K]['value'][],
    options: BulkOperationOptions = {}
  ): Promise<DBSchema[K]['key'][]> {
    const { batchSize = 100 } = options;
    const results: DBSchema[K]['key'][] = [];
    const errors: Error[] = [];

    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);
      
      try {
        const batchResults = await this.processBatch(
          storeName,
          batch,
          'put',
          false
        );
        results.push(...batchResults);
      } catch (error) {
        errors.push(error as Error);
        // 继续处理下一批
      }
    }

    if (errors.length > 0) {
      console.warn(`Bulk put completed with ${errors.length} errors:`, errors);
    }

    return results;
  }

  /**
   * 批量删除记录
   */
  static async bulkDelete<K extends keyof DBSchema>(
    storeName: K,
    keys: DBSchema[K]['key'][],
    options: BulkOperationOptions = {}
  ): Promise<void> {
    const { batchSize = 100 } = options;
    const errors: Error[] = [];

    for (let i = 0; i < keys.length; i += batchSize) {
      const batch = keys.slice(i, i + batchSize);
      
      try {
        await this.deleteBatch(storeName, batch, false);
      } catch (error) {
        errors.push(error as Error);
        // 继续处理下一批
      }
    }

    if (errors.length > 0) {
      console.warn(`Bulk delete completed with ${errors.length} errors:`, errors);
    }
  }

  /**
   * 处理批量操作
   */
  private static async processBatch<K extends keyof DBSchema>(
    storeName: K,
    records: DBSchema[K]['value'][],
    operation: 'add' | 'put',
    continueOnError: boolean
  ): Promise<DBSchema[K]['key'][]> {
    return indexedDBManager.executeTransaction(
      storeName as string,
      'readwrite',
      async (transaction) => {
        const store = transaction.objectStore(storeName as string);
        const results: DBSchema[K]['key'][] = [];
        const promises: Promise<DBSchema[K]['key']>[] = [];

        for (const record of records) {
          const promise = new Promise<DBSchema[K]['key']>((resolve, reject) => {
            const request = operation === 'add' ? store.add(record) : store.put(record);
            
            request.onsuccess = () => {
              resolve(request.result as DBSchema[K]['key']);
            };
            
            request.onerror = () => {
              const error = new IndexedDBError(
                `Failed to ${operation} record`,
                operation === 'add' ? 'ADD_ERROR' : 'PUT_ERROR',
                request.error || undefined
              );
              
              if (continueOnError) {
                console.warn(`${operation} error:`, error);
                resolve(null as any); // 继续处理其他记录
              } else {
                reject(error);
              }
            };
          });
          
          promises.push(promise);
        }

        const batchResults = await Promise.all(promises);
        return batchResults.filter(result => result !== null);
      }
    );
  }

  /**
   * 处理批量删除
   */
  private static async deleteBatch<K extends keyof DBSchema>(
    storeName: K,
    keys: DBSchema[K]['key'][],
    continueOnError: boolean
  ): Promise<void> {
    return indexedDBManager.executeTransaction(
      storeName as string,
      'readwrite',
      async (transaction) => {
        const store = transaction.objectStore(storeName as string);
        const promises: Promise<void>[] = [];

        for (const key of keys) {
          const promise = new Promise<void>((resolve, reject) => {
            const request = store.delete(key);
            
            request.onsuccess = () => {
              resolve();
            };
            
            request.onerror = () => {
              const error = new IndexedDBError(
                'Failed to delete record',
                'DELETE_ERROR',
                request.error || undefined
              );
              
              if (continueOnError) {
                console.warn('Delete error:', error);
                resolve(); // 继续处理其他记录
              } else {
                reject(error);
              }
            };
          });
          
          promises.push(promise);
        }

        await Promise.all(promises);
      }
    );
  }

  /**
   * 范围查询
   */
  static async getRange<K extends keyof DBSchema>(
    storeName: K,
    range: IDBKeyRange,
    options: QueryOptions = {}
  ): Promise<DBSchema[K]['value'][]> {
    return this.getAll(storeName, {
      ...options,
      query: range
    });
  }

  /**
   * 创建键范围
   */
  static createRange(
    lower?: IDBValidKey,
    upper?: IDBValidKey,
    lowerOpen = false,
    upperOpen = false
  ): IDBKeyRange {
    if (lower !== undefined && upper !== undefined) {
      return IDBKeyRange.bound(lower, upper, lowerOpen, upperOpen);
    } else if (lower !== undefined) {
      return IDBKeyRange.lowerBound(lower, lowerOpen);
    } else if (upper !== undefined) {
      return IDBKeyRange.upperBound(upper, upperOpen);
    } else {
      throw new Error('At least one bound must be specified');
    }
  }

  /**
   * 搜索记录（模糊匹配）
   */
  static async search<K extends keyof DBSchema>(
    storeName: K,
    searchTerm: string,
    searchFields: (keyof DBSchema[K]['value'])[],
    options: QueryOptions = {}
  ): Promise<DBSchema[K]['value'][]> {
    const allRecords = await this.getAll(storeName, options);
    const searchTermLower = searchTerm.toLowerCase();

    return allRecords.filter(record => {
      return searchFields.some(field => {
        const value = record[field];
        if (typeof value === 'string') {
          return value.toLowerCase().includes(searchTermLower);
        }
        return false;
      });
    });
  }

  /**
   * 获取唯一值
   */
  static async getDistinct<K extends keyof DBSchema>(
    storeName: K,
    field: keyof DBSchema[K]['value'],
    options: QueryOptions = {}
  ): Promise<unknown[]> {
    const allRecords = await this.getAll(storeName, options);
    const uniqueValues = new Set<unknown>();

    allRecords.forEach(record => {
      const value = record[field];
      if (value !== undefined && value !== null) {
        uniqueValues.add(value);
      }
    });

    return Array.from(uniqueValues);
  }
}