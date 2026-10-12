// 原生 getter 计数与独立分配采样；计时期间不安装 getter 探针。
import { indexedDBManager } from '../../src/background/indexeddb';
import { IndexedDBQuery } from '../../src/background/indexeddb-query';
import type { Clip } from '../../src/types/clip';
function assert(value:unknown,message:string):asserts value{if(!value)throw new Error(message);}
async function probe(operation:()=>Promise<void>){
  const keyDescriptor=Object.getOwnPropertyDescriptor(IDBCursor.prototype,'key')!,primaryDescriptor=Object.getOwnPropertyDescriptor(IDBCursor.prototype,'primaryKey')!;
  let keyReads=0,primaryKeyReads=0;
  try{
    Object.defineProperty(IDBCursor.prototype,'key',{...keyDescriptor,get(){keyReads++;return keyDescriptor.get!.call(this);}});
    Object.defineProperty(IDBCursor.prototype,'primaryKey',{...primaryDescriptor,get(){primaryKeyReads++;return primaryDescriptor.get!.call(this);}});
    await operation();
  }finally{Object.defineProperty(IDBCursor.prototype,'key',keyDescriptor);Object.defineProperty(IDBCursor.prototype,'primaryKey',primaryDescriptor);}
  return {keyReads,primaryKeyReads};
}
const median=(v:number[])=>v.toSorted((a,b)=>a-b)[3];
const params=new URLSearchParams(location.search),reverse=params.has('reverse'),allocations=params.has('allocations');
(window as any).__cacheAllocationCases=[];
(window as any).__performanceCleanup=()=>indexedDBManager.close();
try{
  const results=[];
  for(const records of reverse?[10000,100]:[100,10000]){
    const clips:Clip[]=Array.from({length:records},(_,i)=>({id:String(i).padStart(5,'0'),title:i%7?`Title ${i%100}`:undefined,
      textContent:`${i%2?'测试 Needle':'plain'} ${'Performance fixture '.repeat(32)}`,htmlContent:`<p>${'Rich content '.repeat(64)}</p>`,sourceUrl:`https://example.com/${i%100}`,createdAt:new Date(Date.UTC(2025,0,1)+Math.floor(i/5)*1000).toISOString()}));
    await indexedDBManager.clear('clips');await IndexedDBQuery.bulkPut('clips',clips,{batchSize:1000});const scenarios=[];
    for(const indexName of reverse?['createdAt_id','textContent']:['textContent','createdAt_id'])for(const direction of reverse?['prev','next'] as const:['next','prev'] as const){
      const options={indexName,direction},expected=await IndexedDBQuery.getAll('clips',options);
      for(const pageSize of reverse?[100,20,1]:[1,20,100]){
        const page=records===100?Math.ceil(records/pageSize):Math.floor(records*.45/pageSize)+1,offset=(page-1)*pageSize,expectedPage=JSON.stringify(expected.slice(offset,offset+pageSize));
        async function prepare(){indexedDBManager.close();await IndexedDBQuery.count('clips',indexName);}
        async function run(){const result=await IndexedDBQuery.paginate('clips',page,pageSize,options);assert(result.total===records&&result.totalPages===Math.ceil(records/pageSize)&&JSON.stringify(result.data)===expectedPage,'Total/order/full fields differ');}
        await prepare();const reads=await probe(run);
        const samples=[];
        if(!allocations)for(let i=0;i<7;i++){await prepare();const start=performance.now();await run();samples.push(performance.now()-start);}
        scenarios.push({indexName,direction,pageSize,page,offset,...reads,samples,medianMs:samples.length?median(samples):undefined});
        if(allocations&&(pageSize===20||pageSize===100)){
          let reference=expected;
          (window as any).__cacheAllocationCases.push({records,name:`${indexName}/${direction}/size${pageSize}`,prepare:async()=>{
            await indexedDBManager.clear('clips');await IndexedDBQuery.bulkPut('clips',clips,{batchSize:1000});indexedDBManager.close();await IndexedDBQuery.count('clips',indexName);reference=await IndexedDBQuery.getAll('clips',options);
          },operation:async()=>{
            for(let i=0;i<100;i++){
              const target=records===100?i%Math.ceil(records/pageSize)+1:Math.max(1,Math.min(Math.ceil(records/pageSize),4+i));
              const result=await IndexedDBQuery.paginate('clips',target,pageSize,options),at=(target-1)*pageSize;
              assert(result.total===records&&JSON.stringify(result.data)===JSON.stringify(reference.slice(at,at+pageSize)),'Allocation batch fields/order differ');
            }
          }});
        }
      }
    }
    const partial=[];
    if(records===10000&&!allocations)for(const direction of ['next','prev'] as const){
      const extra=Array.from({length:5},(_,i)=>({...clips[0]!,id:`extra${i}`,createdAt:direction==='next'?'2099-01-01T00:00:00Z':'1999-01-01T00:00:00Z'}));
      await indexedDBManager.clear('clips');await IndexedDBQuery.bulkPut('clips',[...clips,...extra],{batchSize:1000});
      const options={indexName:'createdAt_id',direction},reference=await IndexedDBQuery.getAll('clips',options);
      async function prepare(){indexedDBManager.close();await IndexedDBQuery.paginate('clips',500,20,options);}
      async function run(){const result=await IndexedDBQuery.paginate('clips',501,20,options);assert(result.total===10005&&JSON.stringify(result.data)===JSON.stringify(reference.slice(10000)),'Partial forward page differs');}
      await prepare();const reads=await probe(run),samples=[];
      for(let i=0;i<7;i++){await prepare();const start=performance.now();await run();samples.push(performance.now()-start);}
      const next=await IndexedDBQuery.paginate('clips',5002,2,options);assert(JSON.stringify(next.data)===JSON.stringify(reference.slice(10002,10004)),'Partial last boundary differs');
      partial.push({direction,...reads,samples,medianMs:median(samples),lastBoundary:true});
    }
    results.push({records,scenarios,partial});
  }
  (window as any).__performanceResult={scenario:'page-endpoints',userAgent:navigator.userAgent,reverse,results};
}catch(error){(window as any).__performanceResult={error:String(error)};}
finally{indexedDBManager.close();}
