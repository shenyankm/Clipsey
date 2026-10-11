// Real Firefox MV2 runtime, isolated profile and synthetic data. No Selenium dependency.
import {spawn} from 'node:child_process';
import {mkdtemp,rm,readFile,writeFile,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createServer} from 'node:net';
import assert from 'node:assert/strict';
assert(process.env.FIREFOX_PATH,'Set FIREFOX_PATH to a Firefox executable');
assert(process.env.GECKODRIVER_PATH,'Set GECKODRIVER_PATH to a geckodriver executable');
const extensionRoot=resolve(process.env.EXTENSION_PATH??'.output/firefox-mv2');
const manifest=JSON.parse(await readFile(join(extensionRoot,'manifest.json'),'utf8'));
assert.equal(manifest.manifest_version,2,'This acceptance script requires the Firefox MV2 build');
const profileRoot=await mkdtemp(join(tmpdir(),'clipsey-firefox-profile-'));
const artifactRoot=await mkdtemp(join(tmpdir(),'clipsey-firefox-acceptance-'));
const socket=createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));
const driver=spawn(process.env.GECKODRIVER_PATH,['--host','127.0.0.1','--port',String(port),'--profile-root',profileRoot,'--allow-system-access'],{stdio:['ignore','pipe','pipe']});
let log='',session,startupError;
driver.stdout.on('data',d=>{log+=d});driver.stderr.on('data',d=>{log+=d});
driver.on('error',e=>{startupError=e;log+=e.stack});
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function request(path,body,method=body===undefined?'GET':'POST'){
 const r=await fetch(`http://127.0.0.1:${port}${path}`,{method,headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(50000)});const reply=await r.json();if(!r.ok||reply.value?.error)throw new Error(JSON.stringify(reply));return reply.value;
}
const command=(path,body,method)=>request(`/session/${session}${path}`,body,method);
const run=(script,args=[])=>command('/execute/sync',{script,args});
const asyncRun=(script,args=[])=>command('/execute/async',{script,args});
const evaluate=async(fn,...args)=>{
 const reply=await asyncRun(`const done=arguments[arguments.length-1];const args=Array.from(arguments).slice(0,-1);Promise.resolve().then(()=>(${fn.toString()})(...args)).then(value=>done({value}),error=>done({scriptError:String(error.message||error)+"\\n"+error.stack}));`,args);
 if(reply.scriptError)throw new Error(reply.scriptError);return reply.value;
};
// WebDriver clones undefined optional properties as null; use the JSON backup representation for Node-side comparisons.
const rpc=message=>evaluate(async message=>JSON.parse(JSON.stringify(await browser.runtime.sendMessage(message))),message);
async function waitFor(fn,...args){for(let i=0;i<200;i++){if(await run(`return (${fn.toString()})(...arguments)`,args))return;await pause(100)}throw new Error(`UI timeout: ${fn}`)}
const passed=[],results=[];const record=name=>{passed.push(name);console.log('PASS',name)};
try{
 for(let i=0;i<100;i++){try{await request('/status');break}catch{if(startupError)throw startupError;if(driver.exitCode!==null)throw new Error(log);if(i===99)throw new Error('Driver startup timeout');await pause(100)}}
 const started=await request('/session',{capabilities:{alwaysMatch:{browserName:'firefox','moz:firefoxOptions':{binary:process.env.FIREFOX_PATH,args:['-headless'],prefs:{'browser.download.folderList':2,'browser.download.dir':artifactRoot,'browser.download.useDownloadDir':true,'browser.helperApps.neverAsk.saveToDisk':'application/json','browser.download.always_ask_before_handling_new_types':false}}}}});
 session=started.sessionId;console.log('CAPABILITIES',JSON.stringify(started.capabilities));
 await command('/timeouts',{script:40000,pageLoad:40000,implicit:0});
 const addon=await command('/moz/addon/install',{path:extensionRoot,temporary:true});console.log('ADDON',addon);
 await command('/moz/context',{context:'chrome'});
 const uuid=await run('return JSON.parse(Services.prefs.getCharPref("extensions.webextensions.uuids"))[arguments[0]]',[addon]);assert(uuid);console.log('UUID',uuid);
 await command('/moz/context',{context:'content'});
 await command('/url',{url:`moz-extension://${uuid}/options.html?tab=content`});
 await waitFor(()=>!!document.querySelector('.clip-manager input.ant-input'));
 for(const size of process.argv.includes('--reverse')?[10000,100]:[100,10000]){
  const clips=Array.from({length:size},(_,i)=>({id:`clip-${String(i).padStart(5,'0')}`,textContent:`Entry ${i} 测试 🙂 ${i%2?'Needle':'Plain'} ${'text '.repeat(128)}`,htmlContent:`<p>Entry ${i} <strong>${'text '.repeat(128)}</strong>测试🙂</p>`,sourceUrl:i<45?'https://example.com/article':`https://example.com/other/${i}`,createdAt:new Date(1700000000000+i*1000).toISOString(),updatedAt:'2025-02-01T00:00:00.000Z',title:`Entry ${i}`}));
  const imported=await evaluate(async clips=>{window.__clips=clips;const start=performance.now();const response=await browser.runtime.sendMessage({type:'IMPORT_DATA',payload:{clips,errorLogs:[]}});return{response,ms:performance.now()-start}},clips);
  assert.equal(imported.response.success,true);assert.equal(imported.response.data.clipsImported,size);
  await waitFor(size=>document.querySelector('.clip-toolbar__stat-value')?.textContent===String(size)&&document.querySelectorAll('tr.ant-table-row').length===20,size);
  const pageSamples=[];
  for(let i=0;i<8;i++){
   const result=await evaluate(async()=>{const start=performance.now();const response=await browser.runtime.sendMessage({type:'REQUEST_CLIPS_PAGED',payload:{url:'https://example.com/article#:~:text=ignored',page:2,pageSize:20,sortOrder:'desc'}});const ms=performance.now()-start;const expected=window.__clips.slice(5,25).toReversed();if(!response.success||response.data.total!==45||response.data.items.length!==20)throw new Error('Page request failed');for(let i=0;i<expected.length;i++){const c=response.data.items[i];if('__clipseyUrlKey' in c||Object.keys(c).filter(k=>c[k]!==undefined).length!==Object.keys(expected[i]).length||Object.entries(expected[i]).some(([k,v])=>c[k]!==v))throw new Error('Paged public record changed');}return{ms,ids:response.data.items.map(c=>c.id)}});
   assert.deepEqual(result.ids,clips.slice(5,25).toReversed().map(c=>c.id));
   if(i)pageSamples.push(result.ms);
  }
  const fullSamples=[];
  for(let i=0;i<8;i++){
   const result=await evaluate(async()=>{const start=performance.now();const response=await browser.runtime.sendMessage({type:'REQUEST_CLIPS'});const ms=performance.now()-start;const expected=window.__clips.toReversed();if(!response.success||response.data.length!==expected.length)throw new Error('Full request failed');for(let i=0;i<expected.length;i++){const c=response.data[i];if('__clipseyUrlKey' in c||Object.keys(c).filter(k=>c[k]!==undefined).length!==Object.keys(expected[i]).length||Object.entries(expected[i]).some(([k,v])=>c[k]!==v))throw new Error('Full public record changed');}return{ms,count:response.data.length}});
   if(i)fullSamples.push(result.ms);
  }
  record(`${size}: real import, URL page two, full record order/fields and private-field isolation`);
  const samples={pretty:[],compact:[],backgroundJson:[]};
  await evaluate(()=>{window.__backupOperation=async mode=>{const start=performance.now();const response=await browser.runtime.sendMessage({type:mode==='backgroundJson'?'EXPORT_BACKUP_JSON':'EXPORT_DATA'});const replied=performance.now();if(!response.success)throw new Error('Export failed');const json=mode==='backgroundJson'?response.data:mode==='pretty'?JSON.stringify(response.data,null,2):JSON.stringify(response.data);if(typeof json!=='string')throw new Error('Not a JSON string');const serialized=performance.now();const blob=new Blob([json],{type:'application/json'});const end=performance.now();window.__backupBlob=blob;return{messageMs:replied-start,serializeMs:serialized-replied,blobMs:end-serialized,totalMs:end-start,bytes:blob.size}}});
  const validateBackup=()=>evaluate(async()=>{const data=JSON.parse(await window.__backupBlob.text());const expected=window.__clips.toReversed();if(data.version!=='2.0'||isNaN(Date.parse(data.exportedAt))||data.errorLogs.length!==0||data.clips.length!==expected.length)throw new Error('Backup envelope changed');for(let i=0;i<expected.length;i++){const c=data.clips[i];if('__clipseyUrlKey' in c||Object.keys(c).length!==Object.keys(expected[i]).length||Object.entries(expected[i]).some(([k,v])=>c[k]!==v))throw new Error('Backup data changed');}return true});
  const modes=Object.keys(samples);if(process.argv.includes('--reverse'))modes.reverse();
  for(const mode of modes){await evaluate(mode=>window.__backupOperation(mode),mode);assert(await validateBackup())}
  for(let i=0;i<7;i++)for(const mode of [...modes.slice(i%3),...modes.slice(0,i%3)]){await evaluate(()=>{window.__backupBlob=null});samples[mode].push(await evaluate(mode=>window.__backupOperation(mode),mode));assert(await validateBackup())}
  results.push({size,importMs:imported.ms,pageSamples,fullSamples,samples});
  record(`${size}: all backup transports and encodings preserve every field in all measured samples`);
  await evaluate(()=>{const input=document.querySelector('.clip-manager input.ant-input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'@content NEEDLE');input.dispatchEvent(new Event('input',{bubbles:true}));});
  await waitFor(size=>document.querySelector('.clip-toolbar__stat-value')?.textContent===String(size/2)&&!document.querySelector('.ant-spin-spinning'),size);
  assert.deepEqual(await run('return Array.from(document.querySelectorAll("tr.ant-table-row td:first-child"),e=>e.textContent)'),clips.filter(c=>c.textContent.includes('Needle')).toReversed().slice(0,20).map(c=>c.title));
  await evaluate(()=>document.querySelector('.ant-pagination-item-2').click());
  await waitFor(size=>document.querySelector('tr.ant-table-row td:first-child')?.textContent===`Entry ${size-41}`,size);
  assert.deepEqual(await run('return Array.from(document.querySelectorAll("tr.ant-table-row td:first-child"),e=>e.textContent)'),clips.filter(c=>c.textContent.includes('Needle')).toReversed().slice(20,40).map(c=>c.title));
  record(`${size}: actual keyword search count and page two ordering`);
  await evaluate(()=>{const input=document.querySelector('.clip-manager input.ant-input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'');input.dispatchEvent(new Event('input',{bubbles:true}));});
  await waitFor(size=>document.querySelector('.clip-toolbar__stat-value')?.textContent===String(size),size);
  await evaluate(()=>document.querySelector('th.ant-table-cell:first-child').click());
  await waitFor(()=>document.querySelector('tr.ant-table-row td:first-child')?.textContent==='Entry 0');
  const sorted=await evaluate(()=>window.__clips.toSorted((a,b)=>a.title.localeCompare(b.title)||a.id.localeCompare(b.id)).slice(0,20).map(c=>c.title));
  assert.deepEqual(await run('return Array.from(document.querySelectorAll("tr.ant-table-row td:first-child"),e=>e.textContent)'),sorted);
  record(`${size}: actual title sorting`);
  // Reset the mounted manager's sort and search before the next fixture.
  await command('/url',{url:`moz-extension://${uuid}/options.html?tab=content`});await waitFor(()=>!!document.querySelector('.clip-manager input.ant-input'));
 }
 const clips=Array.from({length:10000},(_,i)=>({id:`backup-${i}`,textContent:`摘录 ${i} 🙂 \"quoted\"\n${'text '.repeat(128)}`,htmlContent:`<p>摘录 ${i}<strong>🙂</strong></p>`,sourceUrl:`https://example.com/${i}`,createdAt:new Date(1700000000000+i*1000).toISOString(),updatedAt:'2025-02-01T00:00:00.000Z',title:`Entry ${i}`}));
 assert.equal((await rpc({type:'IMPORT_DATA',payload:{clips,errorLogs:[]}})).success,true);
 await waitFor(()=>document.querySelector('.clip-toolbar__stat-value')?.textContent==='10000');
 await evaluate(()=>Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='导出备份').click());
 let backupPath;
 for(let i=0;i<200;i++){const files=await readdir(artifactRoot);backupPath=files.find(f=>f.startsWith('clipsey-backup-')&&f.endsWith('.json'));if(backupPath&&!files.some(f=>f.endsWith('.part')))break;await pause(100)}
 assert(backupPath,'Backup not downloaded');const downloaded=await readFile(join(artifactRoot,backupPath),'utf8');const backup=JSON.parse(downloaded);
 assert.equal(downloaded,JSON.stringify(backup));assert.deepEqual(backup.clips,clips.toReversed());assert.equal(backup.version,'2.0');assert.deepEqual(backup.errorLogs,[]);
 record('10000: actual compact file download preserves Unicode, newlines, quotes, HTML and all records');
 for(const [format,text] of [['pretty',JSON.stringify(backup,null,2)],['compact',downloaded]]){
  const path=join(artifactRoot,`restore-${format}.json`);await writeFile(path,text);
  const element=await command('/element',{using:'css selector',value:'input[type=file]'});await command(`/element/${element['element-6066-11e4-a52e-4f735466cecf']}/value`,{text:path,value:[...path]});
  await waitFor(()=>!!document.querySelector('.ant-modal-confirm'));
  await evaluate(()=>document.querySelector('.ant-modal-confirm-btns .ant-btn-primary').click());await waitFor(()=>!document.querySelector('.ant-modal-confirm'));
  const restored=await rpc({type:'EXPORT_DATA'});assert.equal(restored.success,true);assert.deepEqual(restored.data.clips,backup.clips);
  record(`10000: ${format} backup restores every field through actual confirmation`);
 }
 const rejected=await rpc({type:'IMPORT_DATA',payload:{clips:[{textContent:'invalid'}]}});assert.equal(rejected.success,false);assert.deepEqual((await rpc({type:'EXPORT_DATA'})).data.clips,backup.clips);record('invalid import preserves all 10000 records');
 await command('/moz/context',{context:'chrome'});
 const extensionErrors=await run('return Services.console.getMessageArray().filter(m=>m.sourceName?.startsWith(arguments[0]) && !(m.flags & 1)).map(m=>({message:m.errorMessage,source:m.sourceName,line:m.lineNumber}))',[`moz-extension://${uuid}/`]);
 assert.deepEqual(extensionErrors,[],'Firefox console contains extension errors');
 await command('/moz/context',{context:'content'});
 await writeFile(join(artifactRoot,'result.json'),JSON.stringify({capabilities:started.capabilities,extensionRoot,addon,uuid,reverse:process.argv.includes('--reverse'),results,passed,extensionErrors},null,2));
 const median=x=>x.toSorted((a,b)=>a-b)[Math.floor(x.length/2)];
 for(const r of results)console.log('RESULT',JSON.stringify({size:r.size,importMs:r.importMs,pagedMedian:median(r.pageSamples),fullMedian:median(r.fullSamples),backup:Object.fromEntries(Object.entries(r.samples).map(([k,v])=>[k,Object.fromEntries(['messageMs','serializeMs','blobMs','totalMs','bytes'].map(field=>[field,median(v.map(s=>s[field]))]))]))}));
 console.log('ARTIFACTS',artifactRoot);
}finally{
 if(session)try{await command('',undefined,'DELETE')}catch(e){console.error('CLEANUP',e.message)}
 driver.kill('SIGTERM');await writeFile(join(artifactRoot,'geckodriver.log'),log);await rm(profileRoot,{recursive:true,force:true});
}
