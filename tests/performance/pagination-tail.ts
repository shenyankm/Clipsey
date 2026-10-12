// 实验：精确计数后从较近一端读取冷深页，不保存全量主键或增加 schema。
import { indexedDBManager } from '../../src/background/indexeddb';
import { IndexedDBQuery } from '../../src/background/indexeddb-query';
import { CLIP_REVISION_KEY, type QueryOptions } from '../../src/types/indexeddb';
import type { Clip } from '../../src/types/clip';
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
const median = (values: number[]) => values.toSorted((a,b) => a-b)[3];
async function tail(page: number, options: QueryOptions) {
  const offset = (page - 1) * 20;
  if (offset < 256) return IndexedDBQuery.paginate('clips', page, 20, options);
  return indexedDBManager.executeTransaction(['clips', 'metadata'], 'readonly', async transaction => {
    const started = performance.now();
    const total: number = await (IndexedDBQuery as any).readCount(transaction, 'clips', options.indexName, options.query);
    const counted = performance.now(), store = transaction.objectStore('clips'), source = options.indexName ? store.index(options.indexName) : store;
    const end = Math.min(total, offset + 20), backwards = total - end < offset, distance = backwards ? total - end : offset;
    const scanDirection = backwards ? options.direction === 'prev' ? 'next' : 'prev' : options.direction as 'next' | 'prev';
    const keys = offset >= total ? [] : await new Promise<IDBValidKey[]>((resolve, reject) => {
      const selected: IDBValidKey[] = []; let skipped = false;
      const request = source.openKeyCursor(options.query, scanDirection);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) { resolve(selected); return; }
        if (!skipped) { skipped = true; if (distance) { cursor.advance(distance); return; } }
        selected.push(cursor.primaryKey);
        if (selected.length === Math.min(20, total - offset)) resolve(selected); else cursor.continue();
      };
    });
    if (backwards) keys.reverse();
    const located = performance.now(), data: Clip[] = await (IndexedDBQuery as any).readKeys(store, keys);
    return { data, total, page, pageSize: 20, totalPages: Math.ceil(total / 20), phases: { count: counted-started, locate: located-counted, hydrate: performance.now()-located }, backwards, distance };
  });
}
try {
  const reverse = new URLSearchParams(location.search).has('reverse'), results = [];
  for (const records of reverse ? [20000, 10001, 10000, 100] : [100, 10000, 10001, 20000]) {
    await indexedDBManager.clear('clips');
    const clips: Clip[] = Array.from({ length: records }, (_,i) => ({ id: String(i).padStart(5,'0'), title: i%7 ? `Title ${i%100}` : undefined,
      textContent: `${i%2 ? '测试 Needle' : 'plain'} ${'Performance fixture '.repeat(32)}`, htmlContent: `<p>${'Rich content '.repeat(64)}</p>`,
      sourceUrl: `https://example.com/article/${i%100}`, createdAt: new Date(Date.UTC(2025,0,1)+Math.floor(i/5)*1000).toISOString() }));
    await IndexedDBQuery.bulkPut('clips',clips,{batchSize:1000});
    const sources: QueryOptions[] = [{},{indexName:'createdAt'},{indexName:'sourceUrl'},{indexName:'textContent'},
      {indexName:'createdAt_id',query:IDBKeyRange.bound([clips[Math.floor(records/5)]!.createdAt,''],[clips[Math.floor(records*.8)]!.createdAt,[]])}];
    if(reverse)sources.reverse(); const scenarios=[];
    for(const source of sources)for(const direction of reverse ? ['prev','next'] as const : ['next','prev'] as const){
      const options={...source,direction},expected=await IndexedDBQuery.getAll('clips',options);
      const pages=[...new Set([1,Math.min(16,Math.ceil(expected.length/20)),Math.floor(expected.length*.9/20)+1,Math.ceil(expected.length/20)+1])];
      if(reverse)pages.reverse();
      for(const page of pages){
        const offset=(page-1)*20,expectedPage=JSON.stringify(expected.slice(offset,offset+20)), samples={current:[] as number[],tail:[] as number[]},phases:unknown[]=[];
        let backwards: boolean|undefined,distance:number|undefined;
        for(let i=0;i<7;i++)for(const method of (i%2===Number(reverse)?['current','tail']:['tail','current']) as ('current'|'tail')[]){
          indexedDBManager.close();await indexedDBManager.get('metadata',CLIP_REVISION_KEY);
          const started=performance.now(),result=method==='current'?await IndexedDBQuery.paginate('clips',page,20,options):await tail(page,options);
          assert(result.total===expected.length&&result.totalPages===Math.ceil(expected.length/20)&&JSON.stringify(result.data)===expectedPage,'Count/order/full fields differ');
          samples[method].push(performance.now()-started);
          if('phases' in result)phases.push(result.phases);
          if('backwards' in result && typeof result.backwards==='boolean')backwards=result.backwards;
          if('distance' in result && typeof result.distance==='number')distance=result.distance;
        }
        scenarios.push({indexName:source.indexName??null,boundedRange:!!source.query,direction,page,offset,total:expected.length,samples,phases,backwards,distance,medians:{current:median(samples.current),tail:median(samples.tail)}});
      }
    }
    results.push({records,scenarios});
  }
  (window as any).__performanceResult={scenario:'pagination-tail',userAgent:navigator.userAgent,reverse,results};
}catch(error){(window as any).__performanceResult={error:String(error)};}finally{indexedDBManager.close();}
