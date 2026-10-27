'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {chromium}=require('playwright');
const {Store}=require('../lib/model.cjs');
const {rendererPage}=require('./shelf-performance.cjs');
const {journey}=require('./library-keyboard-acceptance.cjs');
async function main(){
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'clipboardline-library-keyboard-')),browser=await chromium.launch({headless:true,...(process.argv[2]?{executablePath:process.argv[2]}:{})}),store=new Store(directory),checks=[];
 try{
  const page=await rendererPage(browser,{source:fs.readFileSync(path.join(__dirname,'../renderer.js'),'utf8'),perKind:6,width:1600});
  const pngs=await page.evaluate(()=>Array.from({length:6},(_,index)=>{const canvas=document.createElement('canvas');canvas.width=80;canvas.height=50;const ctx=canvas.getContext('2d');ctx.fillStyle='hsl('+index*47+' 70% 50%)';ctx.fillRect(0,0,80,50);return canvas.toDataURL('image/png');}));
  const fixture={prefix:'Library keyboard fixture',ids:[]},folder=store.modify('createFolder',{name:fixture.prefix+' folder'});fixture.folder=folder.id;fixture.folderName=folder.name;let image=0;
  for(let index=0;index<18;index++){const kind=['image','text','link'][index%3],value=store.insert(kind,kind==='image'?Buffer.from(pngs[image++].split(',')[1],'base64'):kind==='text'?fixture.prefix+' text '+index:'https://example.com/library-keyboard/'+index);store.modify('details',{id:value.id,name:fixture.prefix+' item '+String(index).padStart(2,'0')});value.retainedAt=Date.now();value.createdAt=Date.now()+18000-index*1000;fixture.ids.push(value.id);}
  store.modify('setSettings',{patch:{libraryListMode:false,libraryInspectorVisible:true,librarySidebarVisible:true,language:'en'}});let surface={view:'shelves',windowVisible:true,version:'1.7.7'};
  await page.route('appmedia://**',route=>{const id=new URL(route.request().url()).pathname.split('/')[1],value=store.data.items.find(value=>value.id===id);return value?.imageFile?route.fulfill({contentType:'image/png',body:fs.readFileSync(path.join(directory,'media',value.imageFile))}):route.fulfill({status:404});});
  await page.exposeFunction('libraryStoreCommand',async(action,payload)=>{let result;if(['library','show','settings'].includes(action)){surface={...surface,view:action==='show'?'shelves':action,windowVisible:true};}else if(action==='hide')surface.windowVisible=false;else if(action==='searchImages')result={ids:[],scores:[],available:false,indexing:false};else if(action==='copy'){store.markCopied(payload.ids);result={};}else if(['paste','imageHistory'].includes(action))result={};else result=store.modify(action,payload);return{...store.publicState(),...surface,result};});
  await page.evaluate(state=>{const f=window.__shelfPerformance;window.clipboardLine.command=async(action,payload={})=>{const result=await window.libraryStoreCommand(action,payload);f.emit(result);return result;};f.emit(state);},{...store.publicState(),...surface});
  const until=async(reader,predicate,timeout=10000)=>{const end=Date.now()+timeout;let value,error;while(Date.now()<end){try{value=await reader();if(predicate(value))return value;}catch(e){error=e;}await new Promise(resolve=>setTimeout(resolve,20));}throw new Error('Timed out: '+JSON.stringify(value)+' '+(error?.message||''));};
  await journey({page,fixture,until,editorSelectAll:process.platform==='darwin'?'Meta+a':'Control+a',check:(name,details={})=>{checks.push({name,passed:true,...details});console.log('PASS '+name);}});
  console.log(JSON.stringify({scope:'Real Chromium shipped-renderer focus and key regression; native Windows remains separately required',browser:browser.version(),checks},null,2));
 }finally{await browser.close();fs.rmSync(directory,{recursive:true,force:true});}
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
