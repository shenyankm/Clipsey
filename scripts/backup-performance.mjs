// 实际扩展消息与备份 Blob；临时用户目录，不访问用户摘录。
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';import { tmpdir } from 'node:os';import { join, resolve } from 'node:path';import { createHash } from 'node:crypto';import assert from 'node:assert/strict';
assert(process.env.CHROME_PATH, 'Set CHROME_PATH to an extension-capable Chrome for Testing executable');
const root=await realpath(resolve(process.env.EXTENSION_PATH ?? '.output/chrome-mv3'));
const manifest=JSON.parse(await readFile(join(root,'manifest.json'),'utf8'));
const id=createHash('sha256').update(manifest.key ? Buffer.from(manifest.key,'base64') : root).digest('hex').slice(0,32).replace(/[0-9a-f]/g,x=>String.fromCharCode(97+parseInt(x,16)));
const artifacts=await mkdtemp(join(tmpdir(),'clipsey-backup-performance-'));
const profile=await mkdtemp(join(tmpdir(),'clipsey-backup-json-browser-'));let context;
try {
 context=await chromium.launchPersistentContext(profile,{executablePath:process.env.CHROME_PATH,headless:true,acceptDownloads:true,args:[`--disable-extensions-except=${root}`,`--load-extension=${root}`]});
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`chrome-extension://${id}/options.html`);await page.waitForSelector('.ant-tabs');
 const cdp=await context.newCDPSession(page);
 const browserCdp=await context.browser().newBrowserCDPSession();
 const {targetInfos}=await browserCdp.send('Target.getTargets');
 const target=targetInfos.find(t=>t.type==='service_worker'&&t.url===`chrome-extension://${id}/background.js`);assert(target);
 const {sessionId}=await browserCdp.send('Target.attachToTarget',{targetId:target.targetId,flatten:false});
 let sequence=0;const pending=new Map();
 browserCdp.on('Target.receivedMessageFromTarget',event=>{if(event.sessionId!==sessionId)return;const m=JSON.parse(event.message),cb=pending.get(m.id);if(!cb)return;pending.delete(m.id);clearTimeout(cb.timer);m.error?cb.reject(new Error(JSON.stringify(m.error))):cb.resolve(m.result);});
 const sendWorker=(method,params={})=>new Promise((resolve,reject)=>{const requestId=++sequence;const timer=setTimeout(()=>{pending.delete(requestId);reject(new Error(`${method} timed out`));},10000);pending.set(requestId,{resolve,reject,timer});browserCdp.send('Target.sendMessageToTarget',{sessionId,message:JSON.stringify({id:requestId,method,params})}).catch(error=>{clearTimeout(timer);pending.delete(requestId);reject(error);});});

 await page.evaluate(()=>{window.__backupOperation=async(mode)=>{
  const start=performance.now();const response=await chrome.runtime.sendMessage({type:'EXPORT_DATA'});
  const replied=performance.now();if(!response.success)throw new Error(JSON.stringify(response));
  const json=mode==='object'?JSON.stringify(response.data,null,2):JSON.stringify(response.data);
  if(typeof json!=='string')throw new Error('Not a JSON backup string');
  const serialized=performance.now();const blob=new Blob([json],{type:'application/json'});const end=performance.now();window.__backupBlob=blob;
  return {messageMs:replied-start,serializeMs:serialized-replied,blobMs:end-serialized,totalMs:end-start,bytes:blob.size};
 };});
 const validate=async(size)=>page.evaluate(async size=>{const data=JSON.parse(await window.__backupBlob.text());if(data.version!=='2.0'||isNaN(Date.parse(data.exportedAt))||data.errorLogs.length!==0||data.clips.length!==size)throw new Error('Wrong backup envelope');for(let i=0;i<size;i++){const n=size-1-i,c=data.clips[i];if(c.id!==`clip-${n}`||c.textContent!==`Entry ${n} ${'text '.repeat(128)}`||c.htmlContent!==`<p>Entry ${n} <strong>${'text '.repeat(128)}</strong></p>`||c.title!==`Entry ${n}`||c.sourceUrl!==`https://example.com/other/${n}`||c.createdAt!==new Date(1700000000000+n*1000).toISOString()||c.updatedAt!=='2025-02-01T00:00:00.000Z'||'__clipseyUrlKey' in c)throw new Error('Backup data changed');}return true;},size);
 const results=[];const allocations=[];
 const createClips=size=>Array.from({length:size},(_,i)=>({id:`clip-${i}`,textContent:`Entry ${i} ${'text '.repeat(128)}`,htmlContent:`<p>Entry ${i} <strong>${'text '.repeat(128)}</strong></p>`,sourceUrl:`https://example.com/other/${i}`,createdAt:new Date(1700000000000+i*1000).toISOString(),updatedAt:'2025-02-01T00:00:00.000Z',title:`Entry ${i}`}));
 for(const size of process.argv.includes('--reverse')?[10000,100]:[100,10000]){
  const clips=createClips(size);
  assert.equal((await page.evaluate(clips=>chrome.runtime.sendMessage({type:'IMPORT_DATA',payload:{clips,errorLogs:[]}}),clips)).success,true);
  for(const mode of ['object','compact']){await page.evaluate(mode=>window.__backupOperation(mode),mode);assert(await validate(size));}
  const samples={object:[],compact:[]};
  for(let i=0;i<7;i++)for(const mode of ((i+Number(process.argv.includes('--reverse')))%2?['compact','object']:['object','compact'])){
   await page.evaluate(()=>{window.__backupBlob=null;});await cdp.send('HeapProfiler.collectGarbage');
   samples[mode].push(await page.evaluate(mode=>window.__backupOperation(mode),mode));assert(await validate(size));
  }
  results.push({size,samples,medianMs:Object.fromEntries(Object.entries(samples).map(([mode,s])=>[mode,Object.fromEntries(['messageMs','serializeMs','blobMs','totalMs'].map(k=>[k,s.map(x=>x[k]).sort((a,b)=>a-b)[3]]))]))});
  for(const mode of process.argv.includes('--reverse')?['compact','object']:['object','compact']){
   await page.evaluate(()=>{window.__backupBlob=null;});await cdp.send('HeapProfiler.collectGarbage');
   await sendWorker('HeapProfiler.collectGarbage');
   await sendWorker('HeapProfiler.startSampling',{samplingInterval:32768,includeObjectsCollectedByMajorGC:true,includeObjectsCollectedByMinorGC:true});
   await cdp.send('HeapProfiler.startSampling',{samplingInterval:32768,includeObjectsCollectedByMajorGC:true,includeObjectsCollectedByMinorGC:true});
   const operation=await page.evaluate(mode=>window.__backupOperation(mode),mode);const {profile}=await cdp.send('HeapProfiler.stopSampling');const {profile:workerProfile}=await sendWorker('HeapProfiler.stopSampling');assert(await validate(size));
   allocations.push({size,mode,operation,sampledBytes:profile.samples.reduce((sum,x)=>sum+x.size,0),samples:profile.samples,backgroundSampledBytes:workerProfile.samples.reduce((sum,x)=>sum+x.size,0),backgroundSamples:workerProfile.samples});
  }
 }
 const nativeUi=[];
 const clips=createClips(10000);
 assert.equal((await page.evaluate(clips=>chrome.runtime.sendMessage({type:'IMPORT_DATA',payload:{clips,errorLogs:[]}}),clips)).success,true);
 await page.goto(`chrome-extension://${id}/options.html?tab=content`);
 const downloadReady=page.waitForEvent('download');
 await page.getByRole('button',{name:'导出备份',exact:true}).click();
 const download=await downloadReady;const path=join(artifacts,download.suggestedFilename());await download.saveAs(path);
 const downloaded=await readFile(path,'utf8');const backup=JSON.parse(downloaded);
 assert.equal(downloaded,JSON.stringify(backup));assert.deepEqual(backup.clips,clips.toReversed());
 assert.equal(backup.version,'2.0');assert.deepEqual(backup.errorLogs,[]);
 nativeUi.push('actual compact download preserves all 10000 records and rich content');
 for(const [format,text] of [['pretty',JSON.stringify(backup,null,2)],['compact',downloaded]]){
  await page.locator('input[type=file]').setInputFiles({name:`restore-${format}.json`,mimeType:'application/json',buffer:Buffer.from(text)});
  const dialog=page.getByRole('dialog');await dialog.waitFor();
  await dialog.getByRole('button',{name:/恢\s*复/}).click();await dialog.waitFor({state:'hidden'});
  const restored=await page.evaluate(()=>chrome.runtime.sendMessage({type:'EXPORT_DATA'}));
  assert.equal(restored.success,true);assert.deepEqual(restored.data.clips,backup.clips);
  nativeUi.push(`${format} backup restores all 10000 records through confirmation`);
 }
 console.log('NATIVE UI:',nativeUi);
 assert.deepEqual(errors,[]);await cdp.detach();await browserCdp.send('Target.detachFromTarget',{sessionId});await browserCdp.detach();
 await writeFile(join(artifacts,'result.json'),JSON.stringify({browser:await context.browser().version(),extensionPath:root,reverse:process.argv.includes('--reverse'),results,allocations,nativeUi,errors},null,2));
 console.log('ARTIFACTS:',artifacts);
 for(const r of results)console.log(r.size,r.medianMs);for(const a of allocations)console.log('allocation',a.size,a.mode,a.sampledBytes,'background',a.backgroundSampledBytes);
}finally{try{await context?.close();}finally{await rm(profile,{recursive:true,force:true});}}
