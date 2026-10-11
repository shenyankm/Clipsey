// 独立临时扩展与合成页面，不访问用户浏览器或摘录。
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
assert(process.env.CHROME_PATH, 'Set CHROME_PATH to an extension-capable Chrome for Testing executable');
const root=resolve(process.env.EXTENSION_PATH ?? '.output/chrome-mv3');
const artifacts=await mkdtemp(join(tmpdir(),'clipsey-highlights-acceptance-'));
const profile=await mkdtemp(join(tmpdir(),'clipsey-browser-'));
let context;
const passed=[],errors=[];
const record=name=>{passed.push(name);console.log('PASS:',name);};
try{
 context=await chromium.launchPersistentContext(profile,{
  executablePath:process.env.CHROME_PATH,
  headless:true,args:[`--disable-extensions-except=${root}`,`--load-extension=${root}`]
 });
 const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
 const id=new URL(worker.url()).hostname;
 const options=await context.newPage();options.on('pageerror',e=>errors.push(e.message));
 await options.goto(`chrome-extension://${id}/options.html?tab=content`);
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 const html='<article>'+Array.from({length:10000},(_,i)=>`<p>Prefix ${i} <strong id="q-${i}"> quote-${i} </strong> tail <em>emphasis</em> final text</p>`).join('')+'</article>';
 await page.route('https://example.com/highlights',route=>route.fulfill({contentType:'text/html',body:`<!doctype html><title>Highlight fixture</title>${html}`}));
 await page.goto('https://example.com/highlights');
 const tab=await options.evaluate(async()=> (await chrome.tabs.query({})).find(t=>t.url==='https://example.com/highlights'));
 const send=message=>options.evaluate(({tabId,message})=>chrome.tabs.sendMessage(tabId,message),{tabId:tab.id,message});
 let ping;for(let i=0;i<30;i++){try{ping=await send({type:'PING'});if(ping.success)break;}catch{}await page.waitForTimeout(100);}
 assert.equal(ping?.success,true);
 const source=await page.evaluate(()=>{
  const text=document.body.textContent, node=document.querySelector('#q-10').firstChild;
  const range=document.createRange();range.selectNodeContents(node);
  const selected=range.toString(),offset=text.indexOf('quote-10');
  window.getSelection().removeAllRanges();window.getSelection().addRange(range);
  return {text,offset,before:text.slice(Math.max(0,offset-64),offset),after:text.slice(offset+'quote-10'.length,offset+'quote-10'.length+64)};
 });
 assert.equal((await send({type:'REQUEST_SELECTION'})).success,true);
 const backup=await options.evaluate(()=>chrome.runtime.sendMessage({type:'EXPORT_DATA'}));
 const saved=backup.data.clips.find(c=>c.textContent==='quote-10');
 assert.equal(saved.textOffset,source.offset);assert.equal(saved.contextBefore,source.before);assert.equal(saved.contextAfter,source.after);
 assert.equal((await page.locator('#q-10 [data-clipsey-id]').textContent()).trim(),'quote-10');
 record('actual selection captures the same offset and 64-character contexts before wrapping on a long page');
 await send({type:'ACTIVATE_HIGHLIGHTS',payload:{highlights:[],autoLocate:false}});
 await page.evaluate(html=>{document.body.innerHTML=html;},html);
 let highs=await page.evaluate(()=>{
  const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let offset=0,node;const targets=[];
  while(node=walker.nextNode()){
   const parent=node.parentElement;if(parent?.id?.startsWith('q-')){const i=Number(parent.id.slice(2));if(i>=500&&i<=9050&&(i-500)%450===0)targets.push({highlightId:`restored-${i}`,textContent:`quote-${i}`,textOffset:offset+1});}
   offset+=node.textContent.length;
  }
  return targets.reverse();
 });
 assert.equal(highs.length,20);
 const clips=Array.from({length:10000},(_,i)=>({id:`stored-${i}`,textContent:i<20?highs[i].textContent:`Unrelated ${i}`,sourceUrl:i<20?'https://example.com/highlights':`https://example.com/other/${i}`,highlightId:i<20?highs[i].highlightId:undefined,textOffset:i<20?highs[i].textOffset:undefined,createdAt:new Date(1700000000000+i*1000).toISOString(),updatedAt:'2025-02-01T00:00:00.000Z'}));
 assert.equal((await options.evaluate(clips=>chrome.runtime.sendMessage({type:'IMPORT_DATA',payload:{clips}}),clips)).success,true);
 const stored=await options.evaluate(()=>chrome.runtime.sendMessage({type:'REQUEST_CLIPS_PAGED',payload:{url:'https://example.com/highlights',page:1,pageSize:20,sortOrder:'asc'}}));
 assert.equal(stored.success,true);assert.equal(stored.data.total,20);
 assert.deepEqual(stored.data.items.map(c=>c.textContent),highs.map(h=>h.textContent));
 assert.equal((await options.evaluate(()=>chrome.runtime.sendMessage({type:'REQUEST_CLIPS'}))).data.length,10000);
 highs=stored.data.items;
 record('actual 10000-record library supplies the 20 matching page highlights');
 assert.equal((await send({type:'ACTIVATE_HIGHLIGHTS',payload:{highlights:highs,autoLocate:false}})).success,true);
 for(const h of highs)assert.equal(await page.locator(`[data-clipsey-id="${h.highlightId}"]`).textContent(),h.textContent);
 assert.equal(await page.evaluate(()=>document.body.textContent),source.text);
 record('actual reversed-order activation restores 20 offsets with original markup and text intact');
 await send({type:'ACTIVATE_HIGHLIGHTS',payload:{highlights:highs,autoLocate:false}});
 assert.equal(await page.locator('[data-clipsey-id]').count(),20);
 record('repeat activation reuses existing highlights without creating duplicates');
 await send({type:'ACTIVATE_HIGHLIGHTS',payload:{highlights:[],autoLocate:false}});
 assert.equal(await page.locator('[data-clipsey-id]').count(),0);
 assert.equal(await page.evaluate(()=>document.body.textContent),source.text);
 record('clearing a batch preserves original text');
 const fallbackHighs=highs.map(({textOffset:_offset,...highlight})=>highlight);
 assert.equal((await send({type:'ACTIVATE_HIGHLIGHTS',payload:{highlights:fallbackHighs,autoLocate:false}})).success,true);
 for(const h of highs)assert.equal(await page.locator(`[data-clipsey-id="${h.highlightId}"]`).textContent(),h.textContent);
 assert.equal(await page.evaluate(()=>document.body.textContent),source.text);
 record('actual full-text fallback restores all 20 quotes without saved offsets');
 await send({type:'ACTIVATE_HIGHLIGHTS',payload:{highlights:[],autoLocate:false}});
 await page.evaluate(()=>{document.body.innerHTML='<p>one two three</p>';});
 const adjacent=[{textContent:'three',textOffset:8,highlightId:'three'},{textContent:'one',textOffset:0,highlightId:'one'},{textContent:'two',textOffset:4,highlightId:'two'}];
 assert.equal((await send({type:'ACTIVATE_HIGHLIGHTS',payload:{highlights:adjacent,autoLocate:false}})).success,true);
 for(const h of adjacent)assert.equal(await page.locator(`[data-clipsey-id="${h.highlightId}"]`).textContent(),h.textContent);
 record('live ranges survive wrapping several adjacent quotes in one text node');
 await send({type:'ACTIVATE_HIGHLIGHTS',payload:{highlights:[],autoLocate:false}});
 await page.evaluate(()=>{
  document.body.innerHTML='<p>prefix <b>one</b> middle <i>two</i></p>';
  const observer=new MutationObserver(()=>{if(document.querySelector('[data-clipsey-id="one"]')){
   observer.disconnect();const p=document.createElement('p');p.id='inserted';p.textContent='x'.repeat(18)+'two';document.body.prepend(p);
  }});observer.observe(document.body,{subtree:true,childList:true});
 });
 const pair=[{textContent:'one',textOffset:7,highlightId:'one'},{textContent:'two',textOffset:18,highlightId:'two'}];
 assert.equal((await send({type:'ACTIVATE_HIGHLIGHTS',payload:{highlights:pair,autoLocate:false}})).success,true);
 assert.equal(await page.locator('#inserted [data-clipsey-id="two"]').textContent(),'two');
 assert.equal(await page.locator('i [data-clipsey-id="two"]').count(),0);
 record('external DOM insertion invalidates prepared offsets and preserves the original offset-first fallback');
 await send({type:'ACTIVATE_HIGHLIGHTS',payload:{highlights:[],autoLocate:false}});
 await page.evaluate(()=>{
  document.body.innerHTML='<p>prefix <b>one</b> middle <i>two</i></p>';
  const style=document.createElement('style');style.id='dynamic-sheet';document.head.append(style);
  const observer=new MutationObserver(()=>{if(document.querySelector('[data-clipsey-id="one"]')){
   observer.disconnect();style.sheet.insertRule('i { display: none; }');
  }});observer.observe(document.body,{subtree:true,childList:true});
 });
 assert.equal((await send({type:'ACTIVATE_HIGHLIGHTS',payload:{highlights:pair,autoLocate:false}})).success,true);
 assert.equal(await page.locator('[data-clipsey-id="two"]').count(),0);
 assert.equal(await page.evaluate(()=>getComputedStyle(document.querySelector('i')).display),'none');
 record('CSSOM visibility changes are rechecked before rendering a prepared range');
 await page.evaluate(()=>document.querySelector('#dynamic-sheet').remove());
 await send({type:'ACTIVATE_HIGHLIGHTS',payload:{highlights:[],autoLocate:false}});
 for (const mode of ['cssom', 'media']) {
  await page.setViewportSize({width: 1000, height: 700});
  await page.evaluate(mode=>{
   const gates=mode==='media' ? Array.from({length:20},(_,i)=>`<p id="gate-${i}">gate-${i}!</p>`).join('') : '';
   document.body.innerHTML=`<p id="before">aaaa</p><p id="first">one</p>${gates}<p id="original">two</p><p>b</p><p id="duplicate">two</p>`;
   const text=document.body.textContent;
   window.__dynamicHighlights=Array.from(document.querySelectorAll('#first, [id^="gate-"], #original')).map(el=>({textContent:el.textContent,textOffset:text.indexOf(el.textContent),highlightId:el.id==='original'?'second':el.id}));
   window.__secondPaintDisplay=undefined;
   {
    const observer=new MutationObserver(()=>{if(document.querySelector('[data-clipsey-id="second"]')){
     observer.disconnect();window.__secondPaintDisplay=getComputedStyle(document.querySelector('#before')).display;
    }});observer.observe(document.body,{subtree:true,childList:true});
   }
   const style=document.createElement('style');style.id='changing-prefix';
   if(mode==='media')style.textContent='@media (max-width: 800px) { #before { display: none; } }';
   document.head.append(style);
   window.__prefixChanged=false;
   {
    const observer=new MutationObserver(()=>{if(document.querySelector('[data-clipsey-id="first"]')){
     observer.disconnect();
     if(mode==='cssom')style.sheet.insertRule('#before { display: none; }');
     window.__prefixChanged=true;
    }});observer.observe(document.body,{subtree:true,childList:true});
   }
  },mode);
  assert.equal(await page.evaluate(()=>getComputedStyle(document.querySelector('#before')).display),'block');
  const dynamicHighlights=await page.evaluate(()=>window.__dynamicHighlights);
  const activation=send({type:'ACTIVATE_HIGHLIGHTS',payload:{highlights:dynamicHighlights,autoLocate:false}});
  // 等待首项期间也处理消息拒绝；下面仍 await 原 promise 并报告失败。
  activation.catch(()=>{});
  await page.waitForFunction(()=>window.__prefixChanged,undefined,{timeout:10000});
  if(mode==='media')await page.setViewportSize({width:700,height:700});
  assert.equal((await activation).success,true);
  await page.waitForFunction(()=>window.__secondPaintDisplay!==undefined,undefined,{timeout:10000});
  assert.equal(await page.evaluate(()=>window.__secondPaintDisplay),'none');
  assert.equal(await page.evaluate(()=>getComputedStyle(document.querySelector('#before')).display),'none');
  assert.equal(await page.locator('#original [data-clipsey-id="second"]').textContent(),'two');
  assert.equal(await page.locator('#duplicate [data-clipsey-id="second"]').count(),0);
  record(`${mode} preceding visibility change keeps the prepared target on the original duplicate quote`);
  await send({type:'ACTIVATE_HIGHLIGHTS',payload:{highlights:[],autoLocate:false}});
  await page.evaluate(()=>document.querySelector('#changing-prefix').remove());
 }
 await page.evaluate(()=>{document.body.innerHTML='<div id="hidden" style="display:none"><span>target</span></div><p>before <b id="visible">target</b> after</p>'});
 assert.equal((await send({type:'ACTIVATE_HIGHLIGHTS',payload:{highlights:[{highlightId:'hidden-fallback',textContent:'target',textOffset:13,anchorSelector:'#hidden span'}],autoLocate:false}})).success,true);
 assert.equal(await page.evaluate(()=>document.querySelector('#visible [data-clipsey-id="hidden-fallback"]')?.textContent),'target');
 assert.equal(await page.evaluate(()=>document.querySelectorAll('#hidden [data-clipsey-id]').length),0);
 record('hidden duplicate and hidden selector are skipped when an older offset no longer matches');
 await send({type:'ACTIVATE_HIGHLIGHTS',payload:{highlights:[],autoLocate:false}});
 await page.evaluate(()=>{const range=document.createRange();range.selectNodeContents(Array.from(document.querySelector('#visible').childNodes).find(node=>node.nodeType===Node.TEXT_NODE&&node.textContent==='target'));window.getSelection().removeAllRanges();window.getSelection().addRange(range)});
 assert.equal((await send({type:'REQUEST_SELECTION'})).success,true);
 const selectedVisible=await options.evaluate(()=>chrome.runtime.sendMessage({type:'EXPORT_DATA'}));
 const visibleClip=selectedVisible.data.clips.find(c=>c.textContent==='target');assert(visibleClip);assert.equal(visibleClip.textOffset,7);assert.equal(visibleClip.contextBefore,'before ');assert.equal(visibleClip.contextAfter,' after');
 record('native selection excludes nested hidden text from the saved offset and contexts');
 await send({type:'ACTIVATE_HIGHLIGHTS',payload:{highlights:[],autoLocate:false}});
 await page.evaluate(()=>{document.body.innerHTML='<div style="visibility:hidden"><span id="override" style="visibility:visible;display:contents">visible override</span></div>'});
 assert.equal((await send({type:'ACTIVATE_HIGHLIGHTS',payload:{highlights:[{highlightId:'override',textContent:'visible override'}],autoLocate:false}})).success,true);
 assert.equal(await page.evaluate(()=>document.querySelector('#override [data-clipsey-id="override"]')?.textContent),'visible override');
 record('visible descendants of visibility:hidden and display:contents remain highlightable');
 assert.deepEqual(errors,[]);record('no extension or fixture page exceptions');
 await page.screenshot({path:join(artifacts,'highlights.png'),fullPage:true});
 await writeFile(join(artifacts,'result.json'),JSON.stringify({browser:await context.browser().version(),extensionPath:root,passed,errors},null,2));
 console.log('ARTIFACTS:',artifacts);
}catch(error){for(const [i,page]of (context?.pages() ?? []).entries())await page.screenshot({path:join(artifacts,`failure-${i}.png`),fullPage:false}).catch(()=>{});throw error;}
finally{try{await context?.close();}finally{await rm(profile,{recursive:true,force:true});}}
