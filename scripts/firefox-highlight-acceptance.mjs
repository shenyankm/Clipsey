// Firefox MV2 原生高亮验收；独立临时配置与本地合成页面，不访问用户摘录。
import {spawn} from 'node:child_process';
import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createServer} from 'node:net';
import {createServer as createHttpServer} from 'node:http';
import assert from 'node:assert/strict';
assert(process.env.FIREFOX_PATH,'Set FIREFOX_PATH to a Firefox executable');
assert(process.env.GECKODRIVER_PATH,'Set GECKODRIVER_PATH to a geckodriver executable');
const extensionRoot=resolve(process.env.EXTENSION_PATH??'.output/firefox-mv2');
const manifest=JSON.parse(await readFile(join(extensionRoot,'manifest.json'),'utf8'));
assert.equal(manifest.manifest_version,2,'This acceptance script requires the Firefox MV2 build');
const html='<article>'+Array.from({length:10000},(_,i)=>`<p>Prefix ${i} <strong id="q-${i}"> quote-${i} </strong> tail <em>emphasis</em> final text</p>`).join('')+'</article>';
const fixtureServer=createHttpServer((_req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><title>Highlight fixture</title>'+html)});
await new Promise(r=>fixtureServer.listen(0,'127.0.0.1',r));const fixtureUrl=`http://127.0.0.1:${fixtureServer.address().port}/highlights`;
const profileRoot=await mkdtemp(join(tmpdir(),'clipsey-firefox-profile-'));
const artifactRoot=await mkdtemp(join(tmpdir(),'clipsey-firefox-highlights-'));
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
async function waitFor(fn,...args){for(let i=0;i<200;i++){if(await run(`return (${fn.toString()})(...arguments)`,args))return;await pause(100)}throw new Error(`UI timeout: ${fn}`)}
const passed=[];const record=name=>{passed.push(name);console.log('PASS',name)};
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
 const optionsHandle=await command('/window');const fresh=await command('/window/new',{type:'tab'});const fixtureHandle=fresh.handle;await command('/window',{handle:fixtureHandle});await command('/url',{url:fixtureUrl});
 const inOptions=async(fn,...args)=>{await command('/window',{handle:optionsHandle});return evaluate(fn,...args)};
 const inFixture=async(fn,...args)=>{await command('/window',{handle:fixtureHandle});return evaluate(fn,...args)};
 const waitFixture=async(fn,...args)=>{await command('/window',{handle:fixtureHandle});return waitFor(fn,...args)};
 const tab=await inOptions(async url=>(await browser.tabs.query({})).find(t=>t.url===url),fixtureUrl);assert(tab);
 const send=message=>inOptions(({tabId,message})=>browser.tabs.sendMessage(tabId,message),{tabId:tab.id,message});
 let ping;for(let i=0;i<30;i++){try{ping=await send({type:'PING'});if(ping.success)break}catch{}await pause(100)}assert.equal(ping?.success,true);
 const source=await inFixture(()=>{const text=document.body.textContent,node=document.querySelector('#q-10').firstChild;const range=document.createRange();range.selectNodeContents(node);const offset=text.indexOf('quote-10');window.getSelection().removeAllRanges();window.getSelection().addRange(range);return{text,offset,before:text.slice(Math.max(0,offset-64),offset),after:text.slice(offset+'quote-10'.length,offset+'quote-10'.length+64)}});
 assert.equal((await send({type:'REQUEST_SELECTION'})).success,true);
 const backup=await inOptions(()=>browser.runtime.sendMessage({type:'EXPORT_DATA'}));const saved=backup.data.clips.find(c=>c.textContent==='quote-10');assert(saved);assert.equal(saved.textOffset,source.offset);assert.equal(saved.contextBefore,source.before);assert.equal(saved.contextAfter,source.after);
 assert.equal(await inFixture(()=>document.querySelector('#q-10 [data-clipsey-id]')?.textContent.trim()),'quote-10');record('native selection captures offsets and contexts before wrapping on a 10000-paragraph page');
 await send({type:'ACTIVATE_HIGHLIGHTS',payload:{highlights:[],autoLocate:false}});await inFixture(html=>{document.body.innerHTML=html},html);
 let highs=await inFixture(()=>{const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let offset=0,node;const targets=[];while(node=walker.nextNode()){const parent=node.parentElement;if(parent?.id?.startsWith('q-')){const i=Number(parent.id.slice(2));if(i>=500&&i<=9050&&(i-500)%450===0)targets.push({highlightId:`restored-${i}`,textContent:`quote-${i}`,textOffset:offset+1})}offset+=node.textContent.length}return targets.reverse()});assert.equal(highs.length,20);
 const clips=Array.from({length:10000},(_,i)=>({id:`stored-${i}`,textContent:i<20?highs[i].textContent:`Unrelated ${i}`,sourceUrl:i<20?fixtureUrl:`https://example.com/other/${i}`,highlightId:i<20?highs[i].highlightId:undefined,textOffset:i<20?highs[i].textOffset:undefined,createdAt:new Date(1700000000000+i*1000).toISOString(),updatedAt:'2025-02-01T00:00:00.000Z'}));assert.equal((await inOptions(clips=>browser.runtime.sendMessage({type:'IMPORT_DATA',payload:{clips}}),clips)).success,true);const stored=await inOptions(url=>browser.runtime.sendMessage({type:'REQUEST_CLIPS_PAGED',payload:{url,page:1,pageSize:20,sortOrder:'asc'}}),fixtureUrl);assert.equal(stored.success,true);assert.equal(stored.data.total,20);assert.deepEqual(stored.data.items.map(c=>c.textContent),highs.map(h=>h.textContent));assert.equal((await inOptions(()=>browser.runtime.sendMessage({type:'REQUEST_CLIPS'}))).data.length,10000);highs=stored.data.items;record('actual 10000-record library supplies the 20 matching page highlights');
 assert.equal((await send({type:'ACTIVATE_HIGHLIGHTS',payload:{highlights:highs,autoLocate:false}})).success,true);
 assert.deepEqual(await inFixture(highs=>highs.map(h=>document.querySelector(`[data-clipsey-id="${h.highlightId}"]`)?.textContent),highs),highs.map(h=>h.textContent));assert.equal(await inFixture(()=>document.body.textContent),source.text);record('reversed batch restores 20 original offsets and preserves all markup text');
 await send({type:'ACTIVATE_HIGHLIGHTS',payload:{highlights:highs,autoLocate:false}});assert.equal(await inFixture(()=>document.querySelectorAll('[data-clipsey-id]').length),20);record('repeat activation does not duplicate highlights');
 await send({type:'ACTIVATE_HIGHLIGHTS',payload:{highlights:[],autoLocate:false}});assert.equal(await inFixture(()=>document.querySelectorAll('[data-clipsey-id]').length),0);assert.equal(await inFixture(()=>document.body.textContent),source.text);record('clearing the batch preserves original text');
 const fallbackHighs=highs.map(({textOffset:_offset,...highlight})=>highlight);assert.equal((await send({type:'ACTIVATE_HIGHLIGHTS',payload:{highlights:fallbackHighs,autoLocate:false}})).success,true);assert.deepEqual(await inFixture(highs=>highs.map(h=>document.querySelector(`[data-clipsey-id="${h.highlightId}"]`)?.textContent),highs),highs.map(h=>h.textContent));assert.equal(await inFixture(()=>document.body.textContent),source.text);record('full-text fallback restores 20 quotes without saved offsets');await send({type:'ACTIVATE_HIGHLIGHTS',payload:{highlights:[],autoLocate:false}});
 await inFixture(()=>{document.body.innerHTML='<p>one two three</p>'});const adjacent=[{textContent:'three',textOffset:8,highlightId:'three'},{textContent:'one',textOffset:0,highlightId:'one'},{textContent:'two',textOffset:4,highlightId:'two'}];assert.equal((await send({type:'ACTIVATE_HIGHLIGHTS',payload:{highlights:adjacent,autoLocate:false}})).success,true);assert.deepEqual(await inFixture(highs=>highs.map(h=>document.querySelector(`[data-clipsey-id="${h.highlightId}"]`)?.textContent),adjacent),adjacent.map(h=>h.textContent));record('adjacent quotes in a single text node retain live ranges');
 await send({type:'ACTIVATE_HIGHLIGHTS',payload:{highlights:[],autoLocate:false}});
 await inFixture(()=>{document.body.innerHTML='<p>prefix <b>one</b> middle <i>two</i></p>';const observer=new MutationObserver(()=>{if(document.querySelector('[data-clipsey-id="one"]')){observer.disconnect();const p=document.createElement('p');p.id='inserted';p.textContent='x'.repeat(18)+'two';document.body.prepend(p)}});observer.observe(document.body,{subtree:true,childList:true})});const pair=[{textContent:'one',textOffset:7,highlightId:'one'},{textContent:'two',textOffset:18,highlightId:'two'}];assert.equal((await send({type:'ACTIVATE_HIGHLIGHTS',payload:{highlights:pair,autoLocate:false}})).success,true);assert.equal(await inFixture(()=>document.querySelector('#inserted [data-clipsey-id="two"]')?.textContent),'two');assert.equal(await inFixture(()=>document.querySelectorAll('i [data-clipsey-id="two"]').length),0);record('external insertion invalidates prepared offsets and preserves offset-first fallback');
 await send({type:'ACTIVATE_HIGHLIGHTS',payload:{highlights:[],autoLocate:false}});
 await inFixture(()=>{document.body.innerHTML='<p>prefix <b>one</b> middle <i>two</i></p>';const style=document.createElement('style');style.id='dynamic-sheet';document.head.append(style);const observer=new MutationObserver(()=>{if(document.querySelector('[data-clipsey-id="one"]')){observer.disconnect();style.sheet.insertRule('i { display: none; }')}});observer.observe(document.body,{subtree:true,childList:true})});assert.equal((await send({type:'ACTIVATE_HIGHLIGHTS',payload:{highlights:pair,autoLocate:false}})).success,true);assert.equal(await inFixture(()=>document.querySelectorAll('[data-clipsey-id="two"]').length),0);assert.equal(await inFixture(()=>getComputedStyle(document.querySelector('i')).display),'none');record('CSSOM target hiding is rechecked before a prepared range paints');await inFixture(()=>document.querySelector('#dynamic-sheet').remove());await send({type:'ACTIVATE_HIGHLIGHTS',payload:{highlights:[],autoLocate:false}});
 for(const mode of ['cssom','media']){
  await command('/window',{handle:fixtureHandle});await command('/window/rect',{width:1000,height:700});
  await inFixture(mode=>{const gates=mode==='media'?Array.from({length:50},(_,i)=>`<p id="gate-${i}">gate-${i}!</p>`).join(''):'';document.body.innerHTML=`<p id="before">aaaa</p><p id="first">one</p>${gates}<p id="original">two</p><p>b</p><p id="duplicate">two</p>`;const text=document.body.textContent;window.__dynamicHighlights=Array.from(document.querySelectorAll('#first,[id^="gate-"],#original')).map(el=>({textContent:el.textContent,textOffset:text.indexOf(el.textContent),highlightId:el.id==='original'?'second':el.id}));window.__secondPaintDisplay=undefined;const paint=new MutationObserver(()=>{if(document.querySelector('[data-clipsey-id="second"]')){paint.disconnect();window.__secondPaintDisplay=getComputedStyle(document.querySelector('#before')).display}});paint.observe(document.body,{subtree:true,childList:true});const style=document.createElement('style');style.id='changing-prefix';if(mode==='media')style.textContent='@media (max-width: 800px) { #before { display: none; } }';document.head.append(style);window.__prefixChanged=false;const change=new MutationObserver(()=>{if(document.querySelector('[data-clipsey-id="first"]')){change.disconnect();if(mode==='cssom')style.sheet.insertRule('#before { display: none; }');window.__prefixChanged=true}});change.observe(document.body,{subtree:true,childList:true})},mode);
  assert.equal(await inFixture(()=>getComputedStyle(document.querySelector('#before')).display),'block');
  const dynamic=await inFixture(()=>window.__dynamicHighlights);
  await inOptions(({tabId,highlights})=>{window.__pendingActivation=browser.tabs.sendMessage(tabId,{type:'ACTIVATE_HIGHLIGHTS',payload:{highlights,autoLocate:false}});window.__pendingActivation.catch(()=>{})},{tabId:tab.id,highlights:dynamic});
  await waitFixture(()=>window.__prefixChanged);
  if(mode==='media')await command('/window/rect',{width:700,height:700});
  assert.equal((await inOptions(()=>window.__pendingActivation)).success,true);await waitFixture(()=>window.__secondPaintDisplay!==undefined);assert.equal(await inFixture(()=>window.__secondPaintDisplay),'none');assert.equal(await inFixture(()=>getComputedStyle(document.querySelector('#before')).display),'none');assert.equal(await inFixture(()=>document.querySelector('#original [data-clipsey-id="second"]')?.textContent),'two');assert.equal(await inFixture(()=>document.querySelectorAll('#duplicate [data-clipsey-id="second"]').length),0);record(`${mode} preceding hiding retains the original duplicate quote`);await send({type:'ACTIVATE_HIGHLIGHTS',payload:{highlights:[],autoLocate:false}});await inFixture(()=>document.querySelector('#changing-prefix').remove());
 }
 await inFixture(()=>{document.body.innerHTML='<div id="hidden" style="display:none"><span>target</span></div><p>before <b id="visible">target</b> after</p>'});
 assert.equal((await send({type:'ACTIVATE_HIGHLIGHTS',payload:{highlights:[{highlightId:'hidden-fallback',textContent:'target',textOffset:13,anchorSelector:'#hidden span'}],autoLocate:false}})).success,true);
 assert.equal(await inFixture(()=>document.querySelector('#visible [data-clipsey-id="hidden-fallback"]')?.textContent),'target');
 assert.equal(await inFixture(()=>document.querySelectorAll('#hidden [data-clipsey-id]').length),0);
 record('hidden duplicate and hidden selector are skipped when an older offset no longer matches');
 await send({type:'ACTIVATE_HIGHLIGHTS',payload:{highlights:[],autoLocate:false}});
 await inFixture(()=>{const range=document.createRange();range.selectNodeContents(Array.from(document.querySelector('#visible').childNodes).find(node=>node.nodeType===Node.TEXT_NODE&&node.textContent==='target'));window.getSelection().removeAllRanges();window.getSelection().addRange(range)});
 assert.equal((await send({type:'REQUEST_SELECTION'})).success,true);
 const selectedVisible=await inOptions(()=>browser.runtime.sendMessage({type:'EXPORT_DATA'}));
 const visibleClip=selectedVisible.data.clips.find(c=>c.textContent==='target');assert(visibleClip);assert.equal(visibleClip.textOffset,7);assert.equal(visibleClip.contextBefore,'before ');assert.equal(visibleClip.contextAfter,' after');
 record('native selection excludes nested hidden text from the saved offset and contexts');
 await send({type:'ACTIVATE_HIGHLIGHTS',payload:{highlights:[],autoLocate:false}});
 await inFixture(()=>{document.body.innerHTML='<div style="visibility:hidden"><span id="override" style="visibility:visible;display:contents">visible override</span></div>'});
 assert.equal((await send({type:'ACTIVATE_HIGHLIGHTS',payload:{highlights:[{highlightId:'override',textContent:'visible override'}],autoLocate:false}})).success,true);
 assert.equal(await inFixture(()=>document.querySelector('#override [data-clipsey-id="override"]')?.textContent),'visible override');
 record('visible descendants of visibility:hidden and display:contents remain highlightable');
 await command('/moz/context',{context:'chrome'});const extensionErrors=await run('return Services.console.getMessageArray().filter(m=>m.sourceName?.startsWith(arguments[0])&&!(m.flags&1)).map(m=>({message:m.errorMessage,source:m.sourceName,line:m.lineNumber}))',[`moz-extension://${uuid}/`]);assert.deepEqual(extensionErrors,[]);await command('/moz/context',{context:'content'});record('no extension URL script errors');
 await writeFile(join(artifactRoot,'result.json'),JSON.stringify({capabilities:started.capabilities,extensionRoot,fixtureUrl,paragraphs:10000,passed,extensionErrors},null,2));console.log('ARTIFACTS',artifactRoot);
}finally{
 if(session)try{await command('',undefined,'DELETE')}catch(e){console.error('CLEANUP',e.message)}
 driver.kill('SIGTERM');await new Promise(r=>fixtureServer.close(r));await writeFile(join(artifactRoot,'geckodriver.log'),log);await rm(profileRoot,{recursive:true,force:true});
}
