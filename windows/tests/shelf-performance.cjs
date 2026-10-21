'use strict';
// Reference browser measurements of the shipped renderer, using only synthetic
// clipboard data. These are script+layout timings, not native Windows FPS.
const fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
function syntheticState(perKind=1000){
 let serial=0;const items=[];for(const kind of ['image','text','link'])for(let index=0;index<perKind;index++){
  const id='60000000-0000-4000-8000-'+String(++serial).padStart(12,'0');
  items.push({id,kind,createdAt:1700000000000-index,updatedAt:1700000000000-index,pinned:index%7===0,name:kind==='image'?'Reference image '+index:'',title:kind==='link'?'Reference link '+index:'',text:kind==='text'?'Reference text '+index+'\n'+('Synthetic clipboard content, café İstanbul.\n'.repeat(24)):'',url:kind==='link'?'https://example.com/reference/'+index:'',note:'Synthetic note '+index,ocrText:kind==='image'?'Reference OCR '+index+' '+('Detected synthetic words '.repeat(24)):'',tags:index%5===0?['reference']:[],folderIds:[],trashedAt:index&&index%47===0?1699999999999:null,hiddenFromShelf:!!index&&index%53===0,mediaUrl:'',thumbnailUrl:''});
 }
 return{items,folders:[],settings:{visibleKinds:['image','text','link'],retentionDays:{image:30,text:30,link:30},localShortcuts:{},shortcuts:{},cardSize:'medium',theme:'soft',language:'en'},view:'shelves',windowVisible:true,version:'reference',canUndo:false,imageSearch:{available:true,indexing:true,revision:1},update:{}};
}
async function rendererPage(browser,{source,perKind=1000,width=1600}={}){
 const page=await browser.newPage({viewport:{width,height:1000}}),raw=syntheticState(perKind);
 await page.route('**/*',route=>{const file=new URL(route.request().url()).pathname.slice(1)||'index.html';if(!['index.html','renderer.js','styles.css','locales.js'].includes(file))return route.abort();route.fulfill({contentType:file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html',body:file==='renderer.js'?source.replace(/\}\)\(\);\s*$/,'window.__shelfPerformance.renderer={ui,perform,render,rowItems,item,focusFirst,selectedIds,select,applyState};})();'):fs.readFileSync(path.join(root,file),'utf8')});});
 await page.addInitScript(state=>{
  const thumbnails=Array.from({length:32},(_,index)=>{const canvas=document.createElement('canvas');canvas.width=240;canvas.height=150;const context=canvas.getContext('2d');context.fillStyle='hsl('+index*37+' 45% 45%)';context.fillRect(0,0,240,150);context.fillStyle='#fff';context.fillRect(15+index,20,50,35);return canvas.toDataURL('image/png');});
  let imageIndex=0;for(const value of state.items)if(value.kind!=='text')value.mediaUrl=value.thumbnailUrl=thumbnails[imageIndex++%thumbnails.length];
  let current=state,subscriber,removed=[];const commands=[];
  const emit=patch=>{current={...current,...patch};subscriber?.(structuredClone(current));};
  window.__shelfPerformance={commands,emit,snapshot:()=>structuredClone(current),ready:false};
  window.clipboardLine={subscribe:fn=>{subscriber=fn;return()=>{};},state:async()=>structuredClone(current),command:async(action,payload={})=>{commands.push({action,payload});if(action==='setSettings')current.settings={...current.settings,...payload.patch};if(action==='remove'){removed=current.items.filter(value=>payload.ids.includes(value.id)).map(value=>structuredClone(value));for(const value of current.items)if(payload.ids.includes(value.id))value.hiddenFromShelf=true;current.canUndo=true;}if(action==='undo'){for(const value of removed)Object.assign(current.items.find(item=>item.id===value.id),value);current.canUndo=false;}if(action==='pin')for(const value of current.items)if(payload.ids.includes(value.id))value.pinned=!value.pinned;emit({});return structuredClone(current);}};
 },raw);
 await page.goto('https://clipboardline-performance.test/');await page.waitForFunction(()=>!!window.__shelfPerformance?.renderer&&document.querySelectorAll('.shelf').length===3);
 await page.waitForFunction(()=>Array.from(document.querySelectorAll('.shelves img')).every(image=>image.complete&&image.naturalWidth>0));
 await page.evaluate(()=>{
  const tracker=window.__shelfPerformance;tracker.mutations={removedCards:0,addedCards:0};
  tracker.observer=new MutationObserver(records=>{for(const record of records)for(const [key,list]of [['removedCards',record.removedNodes],['addedCards',record.addedNodes]])for(const node of list)if(node.nodeType===1)tracker.mutations[key]+=(node.matches('.card')?1:0)+node.querySelectorAll('.card').length;});
  tracker.observer.observe(document.getElementById('app'),{childList:true,subtree:true});
 });
 return page;
}
async function referenceMeasurements(page,{iterations=50}={}){
 return page.evaluate(async iterations=>{
  const f=window.__shelfPerformance,r=f.renderer,result={};
  const measure=async(name,action,count=iterations)=>{f.mutations={removedCards:0,addedCards:0};const samples=[];for(let at=0;at<count;at++){const start=performance.now();await action(at);document.getElementById('app').getBoundingClientRect();samples.push(performance.now()-start);await new Promise(requestAnimationFrame);}const sorted=[...samples].sort((a,b)=>a-b);result[name]={iterations:count,p50:sorted[Math.floor(count*.5)],p95:sorted[Math.min(count-1,Math.floor(count*.95))],maximum:sorted.at(-1),...f.mutations};};
  await measure('keyboard-next',()=>r.perform('next'));
  await measure('keyboard-up-down',at=>r.perform(at%2?'up':'down'));
  await measure('page-forward-back',at=>r.perform(at%2?'previousPage':'nextPage'));
  await measure('background-index-progress',at=>f.emit({imageSearch:{available:true,indexing:true,revision:at+2}}));
  await measure('shared-search',at=>{r.ui.search=at%2?'reference 42':'reference 7';r.focusFirst();r.render();},12);
  return{...result,loadedImages:document.querySelectorAll('.shelves img').length,visibleCards:document.querySelectorAll('.shelves .card').length,totalItems:f.snapshot().items.length};
 },iterations);
}
async function main(){
 const args=process.argv.slice(2),option=(name,fallback)=>{const at=args.indexOf(name);return at<0?fallback:args[at+1];};
 const browser=await chromium.launch({headless:true,...(option('--browser')?{executablePath:option('--browser')}:{})});
 try{const report={scope:'Synthetic shipped renderer script + forced layout; no native Windows FPS claim',browser:browser.version(),runs:[]};for(const input of [option('--baseline'),path.join(root,'renderer.js')].filter(Boolean)){
   const source=fs.readFileSync(input,'utf8');for(const perKind of [100,1000,3000]){const page=await rendererPage(browser,{source,perKind});try{report.runs.push({source:path.resolve(input),perKind,...await referenceMeasurements(page)});}finally{await page.close();}}
  }const output=option('--output');if(output){fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');}console.log(JSON.stringify(report));
 }finally{await browser.close();}
}
module.exports={syntheticState,rendererPage,referenceMeasurements};
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
