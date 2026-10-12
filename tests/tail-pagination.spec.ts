// @vitest-environment node

import 'fake-indexeddb/auto';
import { afterAll, beforeEach, expect, it, vi } from 'vitest';
import { indexedDBManager } from '@/background/indexeddb';
import { IndexedDBQuery } from '@/background/indexeddb-query';
import type { Clip } from '@/types/clip';
const clips: Clip[] = Array.from({length:600},(_,i)=>({id:String(i).padStart(5,'0'),textContent:`Text ${i%5}`,htmlContent:`<b>${i}</b>`,
  sourceUrl:`https://example.com/${i%10}`,createdAt:new Date(1700000000000+Math.floor(i/5)*1000).toISOString()}));
beforeEach(async()=>{vi.restoreAllMocks();await indexedDBManager.clear('clips');await IndexedDBQuery.bulkPut('clips',clips);indexedDBManager.close();});
afterAll(()=>{vi.restoreAllMocks();indexedDBManager.close();});
it.each([undefined,'createdAt','sourceUrl','textContent','createdAt_id'].flatMap(indexName=>(['next','prev'] as const).flatMap(direction=>[15,29,30,31].map(page=>({indexName,direction,page})))))('reads the nearer end with exact duplicate-key order / $indexName / $direction / $page',async({page,...options})=>{
  const expected=await IndexedDBQuery.getAll('clips',options),cursor=vi.spyOn(options.indexName?IDBIndex.prototype:IDBObjectStore.prototype,'openKeyCursor'),advance=vi.spyOn(IDBCursor.prototype,'advance'),get=vi.spyOn(IDBObjectStore.prototype,'get');
  const result=await IndexedDBQuery.paginate('clips',page,20,options);
  expect(result.data).toEqual(expected.slice((page-1)*20,page*20));expect(result.total).toBe(600);
  expect(get.mock.contexts.filter(store=>store.name==='clips')).toHaveLength(page===31?0:20);
  if(page===31){expect(cursor).not.toHaveBeenCalled();expect(advance).not.toHaveBeenCalled();}
  else{
    expect(cursor.mock.calls[0]![1]).toBe(page===15?options.direction:options.direction==='next'?'prev':'next');
    if(page===30)expect(advance).not.toHaveBeenCalled();else expect(advance).toHaveBeenCalledWith(page===15?280:20);
  }
});
it.each(['next','prev'] as const)('keeps bounded range and numeric legacy primary keys / %s',async direction=>{
  await indexedDBManager.put('clips',{...clips[0]!,id:1,extra:{preserved:true}} as unknown as Clip);
  const options={indexName:'sourceUrl',direction,query:IDBKeyRange.bound('https://example.com/1','https://example.com/8')},expected=await IndexedDBQuery.getAll('clips',options),advance=vi.spyOn(IDBCursor.prototype,'advance'),count=vi.spyOn(IDBIndex.prototype,'count');
  const result=await IndexedDBQuery.paginate('clips',23,20,options);
  expect(result.data).toEqual(expected.slice(440,460));expect(result.total).toBe(480);expect(advance).toHaveBeenCalledWith(20);
  await IndexedDBQuery.paginate('clips',23,20,options);expect(count).toHaveBeenCalledTimes(2);
});
it('preserves a partial last page and publishes its normal logical boundaries',async()=>{
  await IndexedDBQuery.bulkPut('clips',Array.from({length:5},(_,i)=>({...clips[0]!,id:`extra${i}`})));
  const advance=vi.spyOn(IDBCursor.prototype,'advance');
  const result=await IndexedDBQuery.paginate('clips',31,20);
  expect(result.total).toBe(605);expect(result.data.map(row=>row.id)).toEqual(['extra0','extra1','extra2','extra3','extra4']);expect(advance).not.toHaveBeenCalled();
  advance.mockClear();expect((await IndexedDBQuery.paginate('clips',30,20)).data).toEqual(clips.slice(580));expect(advance).toHaveBeenCalledWith(1);
  const cursor=vi.spyOn(IDBObjectStore.prototype,'openKeyCursor');await IndexedDBQuery.paginate('clips',31,20);expect(cursor).not.toHaveBeenCalled();
});
it('counts only indexed rows with missing fields and preserves mixed primary-key types',async()=>{
  await indexedDBManager.put('clips',{...clips[0]!,createdAt:undefined} as unknown as Clip);
  await indexedDBManager.put('clips',{...clips[1]!,id:1,extra:{kept:true}} as unknown as Clip);
  const options={indexName:'createdAt',direction:'prev' as const},expected=await IndexedDBQuery.getAll('clips',options);
  const result=await IndexedDBQuery.paginate('clips',30,20,options);
  expect(result.total).toBe(600);expect(result.data).toEqual(expected.slice(580));expect(result.data.some(row=>typeof row.id==='number')).toBe(true);
});
it('uses the counted snapshot before a queued deletion and counts again without a revision marker',async()=>{
  const count=IDBObjectStore.prototype.count;let writing:Promise<void>|undefined;
  vi.spyOn(IDBObjectStore.prototype,'count').mockImplementation(function(this:IDBObjectStore,query){const request=count.call(this,query);if(this.name==='clips'&&!writing)writing=indexedDBManager.delete('clips',clips[590]!.id);return request;});
  expect((await IndexedDBQuery.paginate('clips',30,20)).data).toEqual(clips.slice(580));await writing;
  await indexedDBManager.clear('metadata');
  const expected=clips.filter(row=>row.id!==clips[590]!.id),next=await IndexedDBQuery.paginate('clips',30,20);
  expect(next.total).toBe(599);expect(next.data).toEqual(expected.slice(580));
});
it('uses the same nearer-end path for other stores',async()=>{
  await indexedDBManager.clear('errorLogs');const rows=Array.from({length:350},(_,i)=>({id:String(i).padStart(5,'0'),time:new Date(1700000000000+i*1000).toISOString(),message:String(i),context:'fixture',stack:'fixture'}));await IndexedDBQuery.bulkPut('errorLogs',rows);
  const advance=vi.spyOn(IDBCursor.prototype,'advance');expect((await IndexedDBQuery.paginate('errorLogs',17,20,{indexName:'time'})).data).toEqual(rows.slice(320,340));expect(advance).toHaveBeenCalledWith(10);
});
it.each(['synchronous','asynchronous'] as const)('rejects %s count failure before opening the tail cursor',async mode=>{
  vi.spyOn(IDBIndex.prototype,'count').mockImplementation(()=>{
    if(mode==='synchronous')throw new Error('Count failed');
    const request={error:new Error('Count failed'),onerror:null} as unknown as IDBRequest<number>;queueMicrotask(()=>request.onerror!(new Event('error')));return request;
  });
  const cursor=vi.spyOn(IDBIndex.prototype,'openKeyCursor');await expect(IndexedDBQuery.paginate('clips',29,20,{indexName:'createdAt'})).rejects.toThrow('Count failed');expect(cursor).not.toHaveBeenCalled();
  vi.restoreAllMocks();expect((await IndexedDBQuery.paginate('clips',29,20,{indexName:'createdAt'})).data).toEqual(clips.slice(560,580));
});
it('rejects a synchronous tail advance failure and permits a fresh retry',async()=>{
  vi.spyOn(IDBCursor.prototype,'advance').mockImplementation(()=>{throw new Error('Advance failed');});
  await expect(IndexedDBQuery.paginate('clips',29,20)).rejects.toThrow('Advance failed');
  vi.restoreAllMocks();expect((await IndexedDBQuery.paginate('clips',29,20)).data).toEqual(clips.slice(560,580));
});
