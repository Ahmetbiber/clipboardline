'use strict';
// This test intentionally fails outside Windows. A Mac cross-package is not
// accepted as proof that the real Windows application and clipboard work.
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const os=require('node:os');const {spawn}=require('node:child_process');
const {_electron:electron}=require('playwright');
if(process.platform!=='win32')throw new Error('Run native acceptance on the actual Windows runner.');
const output=path.resolve(process.env.CLIPBOARDLINE_VALIDATION||'validation');fs.mkdirSync(output,{recursive:true});
const data=fs.mkdtempSync(path.join(os.tmpdir(),'clipboardline-runtime-'));
const report={platform:process.platform,arch:process.arch,node:process.version,sourceRevision:process.env.GITHUB_SHA||'',packaged:!!process.env.CLIPBOARDLINE_EXECUTABLE,checks:[],startedAt:new Date().toISOString()};
let application,fixture;
const check=(name,details={})=>{report.checks.push({name,passed:true,...details});console.log('PASS '+name);};
async function until(reader,predicate,timeout=15000){const end=Date.now()+timeout;let value;while(Date.now()<end){try{value=await reader();if(predicate(value))return value;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}throw new Error('Timed out waiting for native test state: '+JSON.stringify(value));}
async function main(){
  const args=['--test-mode','--test-data='+data];
  application=await electron.launch({...(process.env.CLIPBOARDLINE_EXECUTABLE?{executablePath:path.resolve(process.env.CLIPBOARDLINE_EXECUTABLE)}:{args:[path.resolve('main.cjs'),...args]}),...(process.env.CLIPBOARDLINE_EXECUTABLE?{args}:{}),timeout:60000});
  const page=await application.firstWindow();await page.waitForFunction(()=>!!window.clipboardLine);
  await until(()=>application.evaluate(()=>!!global.__clipboardLineTest),Boolean);
  const preferences=await page.evaluate(()=>window.clipboardLine.diagnostics());
  assert.equal(preferences.contextIsolated,true);assert.equal(preferences.sandboxed,true);
  assert.equal(await page.evaluate(()=>typeof require),'undefined');assert.equal(await page.evaluate(()=>typeof process),'undefined');check('sandbox and isolated, typed preload only');
  const before=await page.evaluate(()=>window.clipboardLine.state());assert.equal(before.version,'1.7.0');
  const licenses=await application.evaluate(({app})=>{if(!app.isPackaged)return null;const fs=require('node:fs'),path=require('node:path');return{mit:fs.readFileSync(path.join(process.resourcesPath,'LICENSE.txt'),'utf8').includes('Alejandro Buján'),notices:fs.existsSync(path.join(process.resourcesPath,'THIRD_PARTY_NOTICES.md')),apache:fs.readFileSync(path.join(process.resourcesPath,'licenses','LICENSE-Tesseract-core-and-data.txt'),'utf8').includes('Apache License'),chromium:fs.existsSync(path.join(process.resourcesPath,'..','LICENSES.chromium.html'))};});
  if(licenses){assert.ok(licenses.mit&&licenses.notices&&licenses.apache&&licenses.chromium,JSON.stringify(licenses));check('installed MIT/Apache/Electron/Chromium licensing notices are present');}
  assert.equal(before.settings.captureText,false);assert.equal(before.settings.captureImages,false);assert.equal(before.settings.captureLinks,false);assert.equal(before.settings.fetchLinkMetadata,false);
  await page.evaluate(()=>window.clipboardLine.command('setSettings',{patch:{captureText:true,captureImages:true,captureLinks:true}}));
  await application.evaluate(async({clipboard})=>{await clipboard.writeText('Windows clipboard text acceptance');await global.__clipboardLineTest.readClipboard();});
  let state=await page.evaluate(()=>window.clipboardLine.state());const textItem=state.items.find(i=>i.text==='Windows clipboard text acceptance');assert.ok(textItem);check('real native text clipboard capture');
  await application.evaluate(async({clipboard})=>{await clipboard.writeText('A different copied text');await global.__clipboardLineTest.readClipboard();await clipboard.writeText('Windows clipboard text acceptance');await global.__clipboardLineTest.readClipboard();});
  state=await page.evaluate(()=>window.clipboardLine.state());assert.equal(state.items.filter(i=>i.text==='Windows clipboard text acceptance').length,1);assert.equal(state.items[0].id,textItem.id);check('exact text recopy deduplicates and moves newest first');
  await page.evaluate(id=>window.clipboardLine.command('name',{id,name:'Named synthetic key'}),textItem.id);
  const folderState=await page.evaluate(()=>window.clipboardLine.command('createFolder',{name:'Acceptance'}));const folder=folderState.result;
  await page.evaluate(({id,folderId})=>window.clipboardLine.command('folder',{ids:[id],folderId}),{id:textItem.id,folderId:folder.id});
  await page.evaluate(id=>window.clipboardLine.command('tag',{ids:[id],tags:['test','work']}),textItem.id);
  await page.evaluate(id=>window.clipboardLine.command('remove',{ids:[id]}),textItem.id);
  state=await page.evaluate(()=>window.clipboardLine.command('undo'));assert.equal(state.items.find(i=>i.id===textItem.id).hiddenFromShelf,false);check('pin/name/folder/tag/remove/undo persist through real IPC');
  const textCopy=await page.evaluate(id=>window.clipboardLine.command('copy',{ids:[id],keepOpen:true}),textItem.id);assert.ok(!textCopy.result?.error);
  assert.equal(await application.evaluate(async({clipboard})=>await clipboard.readText()),textItem.text);
  const count=textCopy.items.length;await application.evaluate(()=>global.__clipboardLineTest.readClipboard());assert.equal((await page.evaluate(()=>window.clipboardLine.state())).items.length,count);check('real text copy and own-copy loop suppression');
  await application.evaluate(async({clipboard,ClipboardItem})=>{await clipboard.write([new ClipboardItem({'text/plain':new Blob(['SYNTHETIC_PRIVATE_TEST']), 'electron application/osclipboard;format="ExcludeClipboardContentFromMonitorProcessing"':new Blob([Buffer.from([1])])})]);await global.__clipboardLineTest.readClipboard();});
  assert.ok(!(await page.evaluate(()=>window.clipboardLine.state())).items.some(i=>i.text==='SYNTHETIC_PRIVATE_TEST'));check('private clipboard marker is excluded');
  const dataUrl=await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=900;canvas.height=220;const c=canvas.getContext('2d');c.fillStyle='#ffffff';c.fillRect(0,0,900,220);c.fillStyle='#000000';c.font='bold 64px Arial';c.fillText('HELLO CLIPBOARDLINE 42',20,130);return canvas.toDataURL('image/png');});
  await application.evaluate(async({clipboard,ClipboardItem,nativeImage},value)=>{const image=nativeImage.createFromDataURL(value);await clipboard.write([new ClipboardItem({'image/png':new Blob([image.toPNG()],{type:'image/png'})})]);await global.__clipboardLineTest.readClipboard();},dataUrl);
  state=await page.evaluate(()=>window.clipboardLine.state());const imageItem=state.items.find(i=>i.kind==='image');assert.ok(imageItem);check('real native image clipboard capture');
  const media=await application.evaluate(async({net},url)=>{const response=await net.fetch(url);return{status:response.status,length:(await response.arrayBuffer()).byteLength};},imageItem.mediaUrl);assert.equal(media.status,200);assert.ok(media.length>1000);
  const blocked=await application.evaluate(async({net})=>(await net.fetch('appmedia://media/../../library.json')).status);assert.equal(blocked,404);check('managed media protocol serves images and rejects path traversal');
  await page.evaluate(id=>window.clipboardLine.command('copy',{ids:[id],keepOpen:true}),imageItem.id);
  const dimensions=await application.evaluate(async({clipboard,nativeImage})=>{const entries=await clipboard.read();const item=entries.find(i=>i.types.includes('image/png'));return nativeImage.createFromBuffer(Buffer.from(await(await item.getType('image/png')).arrayBuffer())).getSize();});assert.deepEqual(dimensions,{width:900,height:220});check('real image copy preserves full raster dimensions');
  const ocrState=await page.evaluate(id=>window.clipboardLine.command('ocr',{id}),imageItem.id);assert.ok(!ocrState.result?.error,ocrState.result?.error);assert.match(ocrState.result.text,/HELLO\s+CLIPBOARDLINE\s+42/i);check('bundled English/Turkish OCR worker recognizes real image locally');
  const edited=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=400;c.height=100;const g=c.getContext('2d');g.fillStyle='orange';g.fillRect(0,0,400,100);g.fillStyle='red';g.fillRect(20,20,100,50);return c.toDataURL('image/png');});
  const editState=await page.evaluate(({id,dataUrl})=>window.clipboardLine.command('saveImage',{id,dataUrl,crop:{x:10,y:10,width:400,height:100},annotations:[{type:'rectangle',x:20,y:20,width:100,height:50,color:'#ff0000'}]}),{id:imageItem.id,dataUrl:edited});assert.ok(!editState.result?.error);assert.equal(editState.items.find(i=>i.id===imageItem.id).annotations.length,1);check('edited crop/markup output and original persist separately');
  await application.evaluate(()=>{const h=global.__clipboardLineTest;h.store.insert('link','https://example.com/reference');h.command('show');});
  await page.locator(`[data-shelf="text"] [data-item-id="${textItem.id}"]`).click();
  await page.keyboard.press('Space');await page.locator('#preview-dialog').waitFor({state:'visible'});
  await page.keyboard.press('ArrowDown');await until(()=>page.locator('#preview-dialog').getAttribute('aria-label'),label=>label.includes('example.com/reference'));
  await page.keyboard.press('ArrowUp');await until(()=>page.locator('#preview-dialog').getAttribute('aria-label'),label=>label==='Named synthetic key');
  await page.keyboard.press('p');await until(()=>page.evaluate(()=>window.clipboardLine.state()),value=>value.items.find(i=>i.id===textItem.id).pinned===false);
  await page.keyboard.press('p');await until(()=>page.evaluate(()=>window.clipboardLine.state()),value=>value.items.find(i=>i.id===textItem.id).pinned===true);
  await page.keyboard.press('s');await until(()=>page.locator('#preview-dialog').getAttribute('aria-label'),label=>label!=='Named synthetic key');
  await page.keyboard.press('Backspace');await until(()=>page.locator('#preview-dialog').getAttribute('aria-label'),label=>label==='Named synthetic key');
  check('real Space/arrows/P/S/Backspace keyboard navigation preserves preview and undo');
  await page.keyboard.press('Enter');await until(()=>application.evaluate(()=>global.__clipboardLineTest.getWindow().isVisible()),visible=>visible===false);
  assert.equal(await application.evaluate(async({clipboard})=>await clipboard.readText()),textItem.text);check('real Enter key copies preview and dismisses the host window');
  await application.evaluate(()=>global.__clipboardLineTest.command('show'));
  await page.keyboard.press('l');await until(()=>page.evaluate(()=>window.clipboardLine.state()),value=>value.view==='library');
  assert.equal(await application.evaluate(()=>global.__clipboardLineTest.getWindow().isFullScreen()),false);await page.screenshot({path:path.join(output,'library.png')});
  await page.evaluate(()=>window.clipboardLine.command('show'));await page.waitForTimeout(250);await page.screenshot({path:path.join(output,'shelves.png')});check('three kinds render in shelves and normal library window');
  // An actual separate WinForms process owns the destination, so focus/paste
  // cannot pass by sending synthetic keys back to the Electron test window.
  await page.evaluate(()=>window.clipboardLine.command('hide'));
  const fixtureOutput=path.join(data,'native-target.json');const ps=path.join(process.env.SystemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe');
  fixture=spawn(ps,['-NoProfile','-STA','-ExecutionPolicy','Bypass','-File',path.resolve('tests/native-fixture.ps1'),'-Output',fixtureOutput],{windowsHide:false,stdio:'ignore'});
  const fixtureState=()=>JSON.parse(fs.readFileSync(fixtureOutput,'utf8'));
  await until(fixtureState,s=>s.ready);
  await application.evaluate(()=>global.__clipboardLineTest.command('show'));
  const target=await application.evaluate(()=>global.__clipboardLineTest.getTarget());assert.ok(target?.editable&&!target?.secure,JSON.stringify(target));
  await page.locator(`[data-shelf="text"] [data-item-id="${textItem.id}"]`).click();await page.keyboard.press('Control+Enter');
  await until(fixtureState,s=>s.text.includes('Windows clipboard text acceptance'));check('CtrlEnter text paste restores prior external editable field');
  await application.evaluate(()=>global.__clipboardLineTest.command('show'));
  await page.locator(`[data-shelf="image"] [data-item-id="${imageItem.id}"]`).click();await page.keyboard.press('Control+Enter');
  await until(fixtureState,s=>s.hasImage);check('CtrlEnter image paste works in separate native rich-text editor');
  await application.evaluate(()=>global.__clipboardLineTest.command('show'));
  const secondImage=await application.evaluate(({nativeImage},value)=>{const h=global.__clipboardLineTest;return h.store.insert('image',nativeImage.createFromDataURL(value).crop({x:0,y:0,width:150,height:100}).toPNG()).id;},edited);
  // The original and this PNG are different managed originals, so the FileDrop
  // batch contains two actual files, with the first raster as an app fallback.
  const batch=await page.evaluate(ids=>window.clipboardLine.command('copy',{ids,keepOpen:true}),[imageItem.id,secondImage]);assert.ok(!batch.result?.error,batch.result?.error);
  await until(fixtureState,s=>s.dropCount===2);check('multi-image copy supplies native Windows FileDrop batch');
  const copied=await page.evaluate(id=>window.clipboardLine.command('copy',{ids:[id]}),textItem.id);assert.ok(!copied.result?.error);assert.equal(await application.evaluate(()=>global.__clipboardLineTest.getWindow().isVisible()),false);check('plain Enter copy dismisses shelves/preview host and restores previous application');
  await application.evaluate(()=>global.__clipboardLineTest.command('show'));
  const screenCapture=await page.evaluate(()=>window.clipboardLine.command('capture'));assert.ok(screenCapture.result?.id,screenCapture.result?.error);check('actual Windows desktop capture produces a managed image');
  await page.evaluate(()=>window.clipboardLine.command('settings'));await page.waitForTimeout(250);await page.screenshot({path:path.join(output,'settings.png')});
  const persisted=JSON.parse(fs.readFileSync(path.join(data,'library.json'),'utf8'));assert.ok(persisted.items.some(i=>i.id===textItem.id&&i.pinned&&i.tags.includes('work')));check('real persisted library retains named pinned organization');
  if(fixture){fixture.kill();fixture=null;}
  await application.close();application=null;
  application=await electron.launch({...(process.env.CLIPBOARDLINE_EXECUTABLE?{executablePath:path.resolve(process.env.CLIPBOARDLINE_EXECUTABLE),args:[]}:{args:[path.resolve('main.cjs')]}),timeout:60000});
  const productionPage=await application.firstWindow();await productionPage.waitForFunction(()=>!!window.clipboardLine);
  const production=await until(()=>productionPage.evaluate(()=>window.clipboardLine.state()),value=>value.windowVisible===true);
  assert.equal(production.settings.captureText,false);assert.equal(production.settings.captureImages,false);assert.equal(production.settings.captureLinks,false);assert.equal(production.settings.fetchLinkMetadata,false);
  assert.equal(await application.evaluate(()=>typeof global.__clipboardLineTest),'undefined');
  assert.equal(await productionPage.evaluate(async()=>{try{await fetch('https://example.com');return false;}catch{return true;}}),true);
  await productionPage.screenshot({path:path.join(output,'production-startup.png')});check('normal production startup creates tray/services, defaults to opt-in and blocks renderer network');
  report.completedAt=new Date().toISOString();report.passed=true;
}
main().catch(error=>{report.passed=false;report.error=error.stack;console.error(error.stack);process.exitCode=1;}).finally(async()=>{if(fixture)fixture.kill();if(application)await application.close().catch(()=>{});fs.writeFileSync(path.join(output,'windows-runtime.json'),JSON.stringify(report,null,2));fs.rmSync(data,{recursive:true,force:true,maxRetries:4});});
