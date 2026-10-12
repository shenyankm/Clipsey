// @vitest-environment node

import 'fake-indexeddb/auto';
import { afterAll, beforeEach, expect, it, vi } from 'vitest';
import { indexedDBManager } from '@/background/indexeddb';
import { IndexedDBQuery } from '@/background/indexeddb-query';
import type { Clip } from '@/types/clip';
const clips:Clip[]=Array.from({length:600},(_,i)=>({id:String(i).padStart(5,'0'),textContent:`Text ${i%5}`,htmlContent:`<b>${i}</b>`,sourceUrl:'https://example.com',createdAt:new Date(1700000000000+Math.floor(i/5)*1000).toISOString()}));
beforeEach(async()=>{vi.restoreAllMocks();await indexedDBManager.clear('clips');await IndexedDBQuery.bulkPut('clips',clips);indexedDBManager.close();});
afterAll(()=>{vi.restoreAllMocks();indexedDBManager.close();});
it.each(['textContent','createdAt_id'].flatMap(indexName=>[1,20,100].map(pageSize=>({indexName,pageSize}))))('bounds index-key reads independently of page size / $indexName / $pageSize',async({indexName,pageSize})=>{
  const options={indexName},expected=await IndexedDBQuery.getAll('clips',options),key=vi.spyOn(IDBCursor.prototype,'key','get');
  const page=Math.floor(300/pageSize)+1,result=await IndexedDBQuery.paginate('clips',page,pageSize,options);
  expect(result.data).toEqual(expected.slice((page-1)*pageSize,page*pageSize));expect(result.total).toBe(600);
  expect(key).toHaveBeenCalledTimes(pageSize===1?1:2);
  key.mockClear();expect((await IndexedDBQuery.paginate('clips',page,pageSize,options)).data).toEqual(result.data);expect(key).not.toHaveBeenCalled();
});
it('keeps both ends of a partial forward page and reuses its last boundary',async()=>{
  const extra=Array.from({length:5},(_,i)=>({...clips[0]!,id:`extra${i}`,createdAt:'2099-01-01T00:00:00Z'}));await IndexedDBQuery.bulkPut('clips',extra);
  const options={indexName:'createdAt_id'};await IndexedDBQuery.paginate('clips',30,20,options);
  const key=vi.spyOn(IDBCursor.prototype,'key','get'),advance=vi.spyOn(IDBCursor.prototype,'advance');
  const partial=await IndexedDBQuery.paginate('clips',31,20,options);expect(partial.data).toEqual(extra);expect(partial.total).toBe(605);expect(key).toHaveBeenCalledTimes(3);expect(advance).toHaveBeenCalledWith(1);
  key.mockClear();advance.mockClear();expect((await IndexedDBQuery.paginate('clips',302,2,options)).data).toEqual(extra.slice(2,4));expect(advance).toHaveBeenCalledWith(1);
});
