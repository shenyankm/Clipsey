import { IndexedDB, indexedDBManager } from './indexeddb';
import {
  IndexedDBError,
  CLIP_REVISION_KEY,
  type DBSchema,
  type QueryOptions,
  type BulkOperationOptions,
  type TransactionMode
} from '@/types/indexeddb';

type SearchRecord = Pick<DBSchema['clips']['value'], 'id' | 'title' | 'textContent' | 'sourceUrl' | 'createdAt'>;
const searchFields = ['id', 'title', 'textContent', 'sourceUrl', 'createdAt'] as const;
const searchSnapshots = new WeakMap<IDBDatabase, { revision: string; records: SearchRecord[] }>();
const clipCounts = new WeakMap<IDBDatabase, { revision: string; counts: Map<string | undefined, number> }>();

// IndexedDB 查询与批量操作封装
export class IndexedDBQuery {
  static async getAll<K extends keyof DBSchema>(
    storeName: K,
    options: QueryOptions = {}
  ): Promise<DBSchema[K]['value'][]> {
    return indexedDBManager.executeTransaction(storeName as string, 'readonly', transaction => this.readAll(transaction, storeName, options));
  }

  private static async readAll<K extends keyof DBSchema>(
    transaction: IDBTransaction,
    storeName: K,
    options: QueryOptions
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

    const store = transaction.objectStore(storeName as string);
    const source = indexName ? store.index(indexName) : store;

    // 无分页、非 unique 查询可以一次读取，避免每条记录一次游标回调。
    if (!limit && !(offset > 0) && (direction === 'next' || direction === 'prev')) {
      return new Promise<DBSchema[K]['value'][]>((resolve, reject) => {
        const request = source.getAll(query);
        request.onsuccess = () => {
          const rows = request.result.map(value => IndexedDB.readRecord(store, value));
          resolve(direction === 'prev' ? rows.reverse() : rows);
        };
        request.onerror = () => reject(new IndexedDBError(
          'Failed to query records', 'QUERY_ERROR', request.error || undefined
        ));
      });
    }

    return new Promise<DBSchema[K]['value'][]>((resolve, reject) => {
      const results: DBSchema[K]['value'][] = [];
      const keys: IDBValidKey[] = [];
      // shortcut: 主键游标只用于 offset >= 256、最多 100 条的整数页；更小偏移或更大页量需重新实测。
      const keyOnly = Number.isSafeInteger(offset) && offset >= 256 && offset <= 0xffffffff &&
        Number.isSafeInteger(limit) && limit! > 0 && limit! <= 100 && (direction === 'next' || direction === 'prev');
      const finish = () => {
        if (!keyOnly) { resolve(results); return; }
        Promise.all(keys.map(key => new Promise<DBSchema[K]['value']>((resolveRow, rejectRow) => {
          const request = store.get(key);
          request.onsuccess = () => resolveRow(IndexedDB.readRecord(store, request.result));
          request.onerror = () => rejectRow(new IndexedDBError('Failed to query records', 'QUERY_ERROR', request.error || undefined));
        }))).then(resolve, reject);
      };
      let count = 0;
      let skipped = 0;

      const request = keyOnly ? source.openKeyCursor(query, direction) : source.openCursor(query, direction);

      request.onsuccess = () => {
        const cursor = request.result;

        if (!cursor) {
          finish();
          return;
        }

        // 跳过 offset 指定数量的记录
        if (skipped < offset) {
          if (Number.isSafeInteger(offset) && offset <= 0xffffffff) {
            skipped = offset;
            cursor.advance(offset);
          } else {
            skipped++;
            cursor.continue();
          }
          return;
        }

        // 到达 limit 限制时结束
        if (limit && count >= limit) {
          finish();
          return;
        }

        if (keyOnly) keys.push(cursor.primaryKey);
        else results.push(IndexedDB.readRecord(store, (cursor as IDBCursorWithValue).value));
        count++;
        if (keyOnly && count === limit) { finish(); return; }
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
    
    const [total, data] = await indexedDBManager.executeTransaction(
      storeName === 'clips' && options.query === undefined ? ['clips', 'metadata'] : storeName as string, 'readonly', transaction => {
        const hintedTotal = storeName === 'clips' && options.query === undefined ? clipCounts.get(transaction.db)?.counts.get(options.indexName) : undefined;
        const counting = this.readCount(transaction, storeName, options.indexName, options.query);
        const mightBeEmpty = hintedTotal !== undefined && Number.isSafeInteger(offset) && offset >= hintedTotal && Number.isSafeInteger(pageSize) && pageSize > 0 &&
          ['next', 'prev', 'nextunique', 'prevunique', 'asc', 'desc'].includes(options.direction ?? 'next');
        const readPage = () => this.readAll(transaction, storeName, { ...options, limit: pageSize, offset });
        // 旧总数只决定是否等待；空页必须由当前事务的精确总数确认。
        return Promise.all([counting, mightBeEmpty ? counting.then(total => offset >= total ? [] : readPage()) : readPage()]);
      }
    );

    return {
      data,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize)
    };
  }

  static async count<K extends keyof DBSchema>(
    storeName: K,
    indexName?: string,
    query?: IDBValidKey | IDBKeyRange
  ): Promise<number> {
    return indexedDBManager.executeTransaction(
      storeName === 'clips' && query === undefined ? ['clips', 'metadata'] : storeName as string,
      'readonly', transaction => this.readCount(transaction, storeName, indexName, query)
    );
  }

  private static async readCount<K extends keyof DBSchema>(
    transaction: IDBTransaction,
    storeName: K,
    indexName?: string,
    query?: IDBValidKey | IDBKeyRange
  ): Promise<number> {
    const store = transaction.objectStore(storeName as string);
    const source = indexName ? store.index(indexName) : store;
    let revision: unknown;
    if (storeName === 'clips' && query === undefined) {
      revision = (await new Promise<DBSchema['metadata']['value'] | undefined>((resolve, reject) => {
        const request = transaction.objectStore('metadata').get(CLIP_REVISION_KEY);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error('Revision read failed'));
      }))?.value;
      const cached = clipCounts.get(transaction.db);
      if (typeof revision === 'string' && cached?.revision === revision) {
        const total = cached.counts.get(indexName);
        if (total !== undefined) return total;
      } else clipCounts.delete(transaction.db);
    }
    const total = await new Promise<number>((resolve, reject) => {
      const req = source.count(query);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error(indexName ? 'Index count failed' : 'Store count failed'));
    });
    if (typeof revision === 'string') {
      const committedRevision = revision;
      // 完成后、包装器通知调用方前发布；后置监听器可能晚于紧接的下一次查询。
      const complete = transaction.oncomplete;
      transaction.oncomplete = function(event) {
        try {
          const cached = clipCounts.get(transaction.db);
          const counts = cached?.revision === committedRevision ? cached.counts : new Map<string | undefined, number>();
          counts.set(indexName, total);
          clipCounts.set(transaction.db, { revision: committedRevision, counts });
        } finally { complete?.call(this, event); }
      };
    }
    return total;
  }

  static async keysetPaginate<K extends keyof DBSchema>(
    storeName: K,
    pageSize: number,
    options: {
      indexName?: string;
      direction?: 'next' | 'prev';
      pageToken?: IDBValidKey;
    } = {}
  ): Promise<{ items: DBSchema[K]['value'][]; nextPageToken?: IDBValidKey; hasNext: boolean }> {
    const indexName = options.indexName ?? 'createdAt_id';
    const direction: IDBCursorDirection = options.direction === 'next' ? 'next' : 'prev';

    return indexedDBManager.executeTransaction(storeName as string, 'readonly', async (transaction) => {
      const store = transaction.objectStore(storeName as string);
      const index = store.index(indexName);

      let range: IDBKeyRange | undefined;
      if (options.pageToken !== undefined) {
        if (direction === 'prev') {
          range = IDBKeyRange.upperBound(options.pageToken, true);
        } else {
          range = IDBKeyRange.lowerBound(options.pageToken, true);
        }
      }

      return await new Promise<{ items: DBSchema[K]['value'][]; nextPageToken?: IDBValidKey; hasNext: boolean }>((resolve, reject) => {
        const items: DBSchema[K]['value'][] = [];
        let lastKey: IDBValidKey | undefined;
        let collected = 0;
        let hasNext = false;

        const req = index.openCursor(range, direction);
        req.onsuccess = () => {
          const cursor = req.result as IDBCursorWithValue | null;
          if (!cursor) {
            resolve({ items, nextPageToken: lastKey, hasNext });
            return;
          }
          if (collected < pageSize) {
            items.push(IndexedDB.readRecord(store, cursor.value) as DBSchema[K]['value']);
            lastKey = cursor.key as IDBValidKey;
            collected += 1;
            cursor.continue();
            return;
          }
          // 已收集满，探测是否存在下一项
          hasNext = true;
          resolve({ items, nextPageToken: lastKey, hasNext });
        };
        req.onerror = () => reject(req.error ?? new Error('Keyset paginate failed'));
      });
    });
  }

  static async bulkAdd<K extends keyof DBSchema>(
    storeName: K,
    records: DBSchema[K]['value'][],
    options: BulkOperationOptions = {}
  ): Promise<DBSchema[K]['key'][]> {
    return this.writeBatches(storeName, records, 'add', options);
  }

  static async bulkPut<K extends keyof DBSchema>(
    storeName: K,
    records: DBSchema[K]['value'][],
    options: BulkOperationOptions = {}
  ): Promise<DBSchema[K]['key'][]> {
    return this.writeBatches(storeName, records, 'put', options);
  }

  private static async writeBatches<K extends keyof DBSchema>(
    storeName: K,
    records: DBSchema[K]['value'][],
    operation: 'add' | 'put',
    { batchSize = 100 }: BulkOperationOptions
  ): Promise<DBSchema[K]['key'][]> {
    if (!Number.isSafeInteger(batchSize) || batchSize < 1) {
      throw new Error('batchSize must be a positive integer');
    }
    const results: DBSchema[K]['key'][] = [];
    // 每批独立提交；失败必须抛出，不能将部分写入报告为成功。
    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);
      const keys = await indexedDBManager.executeTransaction(storeName, 'readwrite', transaction => {
        const store = transaction.objectStore(storeName);
        return Promise.all(batch.map(record => new Promise<DBSchema[K]['key']>((resolve, reject) => {
          const request = IndexedDB.writeRecord(store, operation, record);
          request.onsuccess = () => resolve(request.result as DBSchema[K]['key']);
          request.onerror = () => reject(request.error ?? new Error(`Failed to ${operation} record`));
        })));
      });
      results.push(...keys);
    }
    return results;
  }

  static async bulkDelete<K extends keyof DBSchema>(
    storeName: K,
    keys: DBSchema[K]['key'][],
    { batchSize = 100 }: BulkOperationOptions = {}
  ): Promise<void> {
    if (!Number.isSafeInteger(batchSize) || batchSize < 1) {
      throw new Error('batchSize must be a positive integer');
    }
    for (let i = 0; i < keys.length; i += batchSize) {
      const batch = keys.slice(i, i + batchSize);
      await indexedDBManager.executeTransaction(storeName, 'readwrite', async transaction => {
        const store = transaction.objectStore(storeName);
        await Promise.all(batch.map(key => new Promise<void>((resolve, reject) => {
          const request = store.delete(key);
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error ?? new Error('Failed to delete record'));
        })));
      });
    }
  }

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

  /**
   * 关键字分页检索：常用排序分批匹配；范围和 unique 查询保留游标路径。
   * - fields：参与匹配的字段集合（字符串字段）
   * - keyword：大小写不敏感匹配
   * - page/pageSize：分页参数
   * - options：支持 indexName 与 direction，用于选择遍历顺序
   */
  static async filterByKeywordPaged<K extends keyof DBSchema>(
    storeName: K,
    keyword: string,
    fields: (keyof DBSchema[K]['value'])[],
    page: number,
    pageSize: number,
    options: QueryOptions = {}
  ): Promise<{ items: DBSchema[K]['value'][]; total: number; page: number; pageSize: number }> {
    const lower = (keyword ?? '').toLowerCase();
    const offset = Math.max(0, (page - 1) * pageSize);
    const limit = Math.max(1, pageSize);

    let snapshot: { database: IDBDatabase; revision: string; records: SearchRecord[] } | undefined;
    const result = await indexedDBManager.executeTransaction(storeName === 'clips' ? ['clips', 'metadata'] : storeName as string, 'readonly', async (transaction) => {
      const store = transaction.objectStore(storeName as string);
      const source = options.indexName ? store.index(options.indexName) : store;
      let direction: IDBCursorDirection = 'next';
      if (options.direction === 'desc' || options.direction === 'prev') {
        direction = 'prev';
      } else if (options.direction === 'asc' || options.direction === 'next') {
        direction = 'next';
      } else if (options.direction) {
        direction = options.direction as IDBCursorDirection;
      }

      if (storeName === 'clips' && options.query === undefined &&
          (direction === 'next' || direction === 'prev') &&
          Number.isSafeInteger(offset) && Number.isSafeInteger(limit) &&
          (options.orderBy === 'title' || ['createdAt', 'sourceUrl', 'textContent'].includes(options.indexName ?? ''))) {
        const read = <T>(request: IDBRequest<T>) => new Promise<T>((resolve, reject) => {
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(new IndexedDBError('Failed to query with keyword', 'QUERY_ERROR', request.error || undefined));
        });
        const localeSort = options.orderBy === 'title';
        const sortField = localeSort ? 'title' : options.indexName as 'createdAt' | 'sourceUrl' | 'textContent';
        const matches: { id: string; key: string }[] = [];
        const compareString = localeSort
          ? (a: string, b: string) => a.localeCompare(b)
          : (a: string, b: string) => a === b ? 0 : a < b ? -1 : 1;
        const order = direction === 'next' ? 1 : -1;
        // 本地化比较相等时沿用原始主键顺序，保持旧排序的稳定性。
        const compare = (a: typeof matches[number], b: typeof matches[number]) =>
          order * (compareString(a.key, b.key) || compareString(a.id, b.id)) || (a.id === b.id ? 0 : a.id < b.id ? -1 : 1);
        const windowSize = offset + limit;
        const canCache = fields.every(field => searchFields.includes(field as typeof searchFields[number]));
        const revision = canCache ? (await read(transaction.objectStore('metadata').get(CLIP_REVISION_KEY)))?.value : undefined;
        let saved = searchSnapshots.get(transaction.db);
        if (canCache && (typeof revision !== 'string' || saved?.revision !== revision)) {
          searchSnapshots.delete(transaction.db);
          saved = undefined;
        }
        const cached = canCache ? saved?.records : undefined;
        // shortcut: 搜索快照最多 10000 条、16 MiB 字段权重；更大正文仍分批扫描，重新实测后再调边界。
        let collected: SearchRecord[] | null = !cached && typeof revision === 'string' ? [] : null;
        let weight = 0;
        let position = 0;
        let total = 0;
        let range: IDBKeyRange | undefined;
        while (true) {
          const batch = cached ? cached.slice(position, position += 256) : await read(store.getAll(range, 256)) as DBSchema['clips']['value'][];
          for (const record of batch) {
            if (collected) {
              weight += 128;
              for (const field of searchFields) {
                const value = record[field];
                if (typeof value === 'string') weight += value.length * 2;
                else if (value != null) { collected = null; break; }
              }
              if (weight > 16 * 1024 * 1024 || collected?.length === 10000) collected = null;
              collected?.push({ id: record.id, title: record.title, textContent: record.textContent, sourceUrl: record.sourceUrl, createdAt: record.createdAt });
            }
            const key = localeSort ? record.title ?? '' : record[sortField];
            if (typeof key === 'string' && ((localeSort && !lower) || fields.some(field => {
              const value = record[field as keyof typeof record];
              return typeof value === 'string' && value.toLowerCase().includes(lower);
            }))) {
              total += 1;
              const candidate = { id: record.id, key };
              // 最大堆只保留截至本页的主键，深页也无需逐次搬移排序数组。
              if (matches.length < windowSize) {
                let position = matches.length;
                matches.push(candidate);
                while (position > 0) {
                  const parent = (position - 1) >>> 1;
                  if (compare(matches[parent]!, candidate) >= 0) break;
                  matches[position] = matches[parent]!;
                  position = parent;
                }
                matches[position] = candidate;
              } else if (compare(candidate, matches[0]!) < 0) {
                let position = 0;
                while (position * 2 + 1 < matches.length) {
                  let child = position * 2 + 1;
                  if (child + 1 < matches.length && compare(matches[child + 1]!, matches[child]!) > 0) child += 1;
                  if (compare(matches[child]!, candidate) <= 0) break;
                  matches[position] = matches[child]!;
                  position = child;
                }
                matches[position] = candidate;
              }
            }
          }
          if (batch.length < 256) break;
          range = IDBKeyRange.lowerBound(batch[batch.length - 1]!.id, true);
        }
        // 保留截至本页的排序主键；单批内容及本页以外的 HTML 可回收。
        matches.sort(compare);
        const items = (await Promise.all(matches.slice(offset, offset + limit).map(({ id }) => read(store.get(id)))))
          .map(value => IndexedDB.readRecord(store, value)) as DBSchema[K]['value'][];
        if (collected) snapshot = { database: transaction.db, revision, records: collected };
        return { items, total, page, pageSize };
      }

      return new Promise<{ items: DBSchema[K]['value'][]; total: number; page: number; pageSize: number }>((resolve, reject) => {
        const items: DBSchema[K]['value'][] = [];
        let total = 0;
        let skipped = 0;

        const request = source.openCursor(options.query, direction);

        request.onsuccess = () => {
          const cursor = request.result as IDBCursorWithValue | null;
          if (!cursor) {
            resolve({ items, total, page, pageSize });
            return;
          }

          const record = IndexedDB.readRecord(store, cursor.value) as DBSchema[K]['value'];
          let matched = false;
          for (const field of fields) {
            const v = (record as any)[field];
            if (typeof v === 'string' && v.toLowerCase().includes(lower)) {
              matched = true;
              break;
            }
          }

          if (matched) {
            total += 1;
            if (skipped < offset) {
              skipped += 1;
            } else if (items.length < limit) {
              items.push(record);
            }
            // 当已收集满本页数据后仍需继续迭代以计算 total
          }

          cursor.continue();
        };

        request.onerror = () => {
          reject(new IndexedDBError('Failed to query with keyword', 'QUERY_ERROR', request.error || undefined));
        };
      });
    });
    if (snapshot) searchSnapshots.set(snapshot.database, { revision: snapshot.revision, records: snapshot.records });
    return result;
  }
}
