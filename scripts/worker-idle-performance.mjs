// 原生 Chrome 页面 CDP；不连接后台调试器、不强制终止后台。
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
assert(process.env.CHROME_PATH, 'Set CHROME_PATH to an extension-capable Chrome for Testing executable');
const extension=await realpath(resolve(process.env.EXTENSION_PATH ?? '.output/chrome-mv3'));
const manifest=JSON.parse(await readFile(join(extension,'manifest.json'),'utf8'));
const extensionId=createHash('sha256').update(manifest.key ? Buffer.from(manifest.key,'base64') : extension).digest('hex').slice(0,32).replace(/[0-9a-f]/g,x=>String.fromCharCode(97+parseInt(x,16)));
assert(manifest.background?.service_worker,'Build a service-worker extension');
const workerUrl=`chrome-extension://${extensionId}/${manifest.background.service_worker}`;
const artifacts=await mkdtemp(join(tmpdir(),'clipsey-worker-idle-results-'));
const profile=await mkdtemp(join(tmpdir(),'clipsey-idle-'));
let chrome,socket;
try {
 chrome=spawn(process.env.CHROME_PATH,['--headless=new','--no-first-run','--no-default-browser-check','--disable-component-extensions-with-background-pages',`--user-data-dir=${profile}`,'--remote-debugging-port=0',`--disable-extensions-except=${extension}`,`--load-extension=${extension}`,'about:blank'],{stdio:'ignore'});
 let launchError;chrome.on('error',e=>launchError=e);
 let port;const launchDeadline=Date.now()+30000;
 while(!port){if(launchError)throw launchError;if(chrome.exitCode!==null||chrome.signalCode!==null)throw new Error('Chrome exited before DevTools port opened');if(Date.now()>launchDeadline)throw new Error('launch timeout');try{port=(await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0];}catch{await new Promise(r=>setTimeout(r,100));}}
 const targets=async()=>await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();
 let worker;const workerDeadline=Date.now()+10000;
 while(!worker){worker=(await targets()).find(t=>t.type==='service_worker'&&t.url===workerUrl);if(Date.now()>workerDeadline)throw new Error('extension worker unavailable');if(!worker)await new Promise(r=>setTimeout(r,100));}
 assert.equal(worker.url,workerUrl);
 const page=(await targets()).find(t=>t.type==='page');assert(page,'Sender page not found');
 socket=new WebSocket(page.webSocketDebuggerUrl);
 await new Promise((res,rej)=>{socket.addEventListener('open',res,{once:true});socket.addEventListener('error',rej,{once:true});});
 let id=0;const pending=new Map();
 socket.addEventListener('message',ev=>{const m=JSON.parse(ev.data);const cb=pending.get(m.id);if(cb){pending.delete(m.id);clearTimeout(cb.timer);m.error?cb.reject(new Error(JSON.stringify(m.error))):cb.resolve(m.result);}});
 const send=(method,params={})=>new Promise((resolve,reject)=>{const requestId=++id;const timer=setTimeout(()=>{pending.delete(requestId);reject(new Error(`${method} timed out`));},15000);pending.set(requestId,{resolve,reject,timer});socket.send(JSON.stringify({id:requestId,method,params}));});
 const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
 const navigation=await send('Page.navigate',{url:`chrome-extension://${extensionId}/options.html`});
 assert(!navigation.errorText,navigation.errorText);
 const pageDeadline=Date.now()+10000;
 while(!await evaluate('document.readyState==="complete" && !!document.querySelector("#app")?.children.length')){if(Date.now()>pageDeadline)throw new Error('options timeout: '+JSON.stringify(await evaluate('({url:location.href,body:document.body.innerText.slice(0,400)})')));await new Promise(r=>setTimeout(r,100));}
 await evaluate(`chrome.storage.local.set({'clipsey-options':{language:'zh-CN',autoHighlightPageSummary:false,autoLocateFirstSummary:false}})`);
 const measure=async(type,size)=>evaluate(`(async()=>{
  const start=performance.now();
  const response=await chrome.runtime.sendMessage(${JSON.stringify(type==='paged'?{type:'REQUEST_CLIPS_PAGED',payload:{url:'https://example.com/article',page:1,pageSize:20,sortOrder:'desc'}}:{type:'REQUEST_CLIPS'})});
  const elapsedMs=performance.now()-start;
  if(!response.success)throw new Error(JSON.stringify(response));
  const items=${type==='paged'?'response.data.items':'response.data'};
  if(items.length!==${type==='paged'?20:size})throw new Error('Wrong item count');
  ${type==='paged'?"if(response.data.total!==45)throw new Error('Wrong paged total');":''}
  if(items[0].id!==${JSON.stringify(type==='paged'?'clip-44':`clip-${size-1}`)})throw new Error('Wrong first ID');
  if(items.some((item,i)=>item.id!=='clip-'+(${type==='paged'?44:size-1}-i)))throw new Error('Wrong item order');
  if(items.some(item=>'__clipseyUrlKey' in item))throw new Error('Private storage metadata leaked');
  return {elapsedMs,count:items.length,firstId:items[0].id,lastId:items.at(-1).id};
 })()`);
 const results=[];
 const sizes=process.argv.includes('--reverse')?[10000,100]:[100,10000];
 for(const size of sizes){
  const clips=Array.from({length:size},(_,i)=>({id:`clip-${i}`,textContent:`Entry ${i} ${'text '.repeat(128)}`,htmlContent:`<p>Entry ${i} <strong>${'text '.repeat(128)}</strong></p>`,sourceUrl:i<45?'https://example.com/article':`https://example.com/other/${i}`,createdAt:new Date(1700000000000+i*1000).toISOString(),title:`Entry ${i}`}));
  const imported=await evaluate(`chrome.runtime.sendMessage({type:'IMPORT_DATA',payload:{clips:${JSON.stringify(clips)}}})`);
  assert.equal(imported.success,true);
  await measure('paged',size);await measure('all',size);
  const samples=[];
  for(let trial=0;trial<7;trial++){
   const old=(await targets()).find(t=>t.type==='service_worker'&&t.url===workerUrl);assert(old);
   const idleStart=performance.now();let stopped=false;
   console.log(JSON.stringify({stage:'waitingForIdle',size,trial,oldTarget:old.id}));
   while(performance.now()-idleStart<60000){
    await new Promise(r=>setTimeout(r,1000));
    if(!(await targets()).some(t=>t.type==='service_worker'&&t.url===workerUrl)){stopped=true;break;}
   }
   assert(stopped,'Worker stayed active for 60s; idle-wakeup coverage unproven');
   const idleMs=performance.now()-idleStart;
   const coldPaged=await measure('paged',size);
   const newer=(await targets()).find(t=>t.type==='service_worker'&&t.url===workerUrl);assert(newer);assert.notEqual(newer.id,old.id);
   const warmPaged=await measure('paged',size);
   const coldAll=await measure('all',size);
   const warmAll=await measure('all',size);
   const sample={idleMs,oldTarget:old.id,newTarget:newer.id,coldPaged,warmPaged,coldAll,warmAll};
   samples.push(sample);console.log(JSON.stringify({stage:'passed',size,trial,...sample}));
  }
  const median=path=>samples.map(s=>s[path].elapsedMs).sort((a,b)=>a-b)[3];
  results.push({size,medianMs:Object.fromEntries(['coldPaged','warmPaged','coldAll','warmAll'].map(k=>[k,median(k)])),samples});
 }
 const browser=await(await fetch(`http://127.0.0.1:${port}/json/version`)).json();
 await writeFile(join(artifacts,'result.json'),JSON.stringify({browser:browser.Browser,extensionPath:extension,workerUrl,workerDebuggerAttached:false,forcedTermination:false,results},null,2));
 console.log('ARTIFACTS:',artifacts);
} finally {
 socket?.close();if(chrome?.pid&&chrome.exitCode===null&&chrome.signalCode===null){const ended=new Promise(r=>chrome.once('exit',r));chrome.kill();await ended;}
 await rm(profile,{recursive:true,force:true});
}
