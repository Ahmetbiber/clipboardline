'use strict';
const {app,BrowserWindow,ipcMain,clipboard,ClipboardItem,nativeImage,protocol,net,Tray,Menu,Notification,powerMonitor,globalShortcut,screen,desktopCapturer,dialog,shell} = require('electron');
// Electron's protocol.handle and net.fetch construct these globals lazily.
// Finish Node/Undici initialization before renderer/protocol callbacks can
// re-enter it during the first managed image request in an installed build.
const {Request:WebRequest,Response:WebResponse,Headers:WebHeaders}=globalThis;
for(const [name,constructor]of Object.entries({Request:WebRequest,Response:WebResponse,Headers:WebHeaders})){
  if(typeof constructor!=='function')throw new Error('Web API initialization failed: '+name);
  const descriptor=Object.getOwnPropertyDescriptor(globalThis,name);
  Object.defineProperty(globalThis,name,{value:constructor,writable:true,configurable:true,enumerable:descriptor?.enumerable??false});
}
new WebRequest('https://example.invalid/');new WebResponse(null,{headers:new WebHeaders()});
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {pathToFileURL} = require('node:url');
const {spawn} = require('node:child_process');
const {Store,plainURL,ids} = require('./lib/model.cjs');
const {privateClipboard}=require('./lib/clipboard-policy.cjs');
const {mediaOrigin}=require('./lib/media-policy.cjs');
const {mediaResponse,mediaGenerationMatches}=require('./lib/media-response.cjs');
const {MediaJobs,MAXIMUM_VIDEO_BYTES}=require('./lib/media.cjs');
const {copyFiles,cancelFileCopies}=require('./lib/native-files.cjs');
const native = require('./lib/native.cjs');
const {PasteTargetTracker}=require('./lib/paste-target.cjs');
const {DragFiles}=require('./lib/drag-files.cjs');
const {metadataFetch,linkMetadata} = require('./lib/network.cjs');
const {Updates,AutomaticUpdateScheduler} = require('./lib/updates.cjs');
const {GlobalShortcuts}=require('./lib/global-shortcuts.cjs');
const {ImageSearch,modelPaths}=require('./lib/image-search.cjs');
const BUILD_NUMBER=Number(require('./package.json').clipboardLineBuild)||63;
const testMode = process.argv.includes('--test-mode');
const testFolder = process.argv.find(value=>value.startsWith('--test-data='))?.slice('--test-data='.length);
if(testMode && testFolder) app.setPath('userData',path.resolve(testFolder));
const development=!app.isPackaged&&!testMode;
if(development){const directory=path.join(app.getPath('appData'),'ClipBoardLine Dev');fs.mkdirSync(directory,{recursive:true,mode:0o700});app.setPath('userData',directory);}
app.setName(development?'ClipBoardLine Dev':'ClipBoardLine');
protocol.registerSchemesAsPrivileged([{scheme:'appmedia',privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true,stream:true}}]);
let window,store,tray,updates,updateScheduler,monitor,clipboardTimer,retentionTimer,updateTimer,updateLaunchTimer,previous=null,view='shelves',message='',viewEvent=null;
let lastFingerprint='',ownFingerprint='',capturing=false,pendingClipboard=false,showing=false,closing=false,watchers=[],normalBounds=null,normalMaximized=false,applyingBounds=false;
let pastePromise=null,hidePromise=null,pasteGeneration=0;
const pasteTargets=new PasteTargetTracker(process.pid);
const entry = pathToFileURL(path.join(__dirname,'index.html')).href;
const copyMarker = crypto.randomBytes(16);
const pending = new Map();
const ocrJobs=new Map(),ocrQueue=[];let indexing=false;
const mediaDiagnostics=[];
let imageSearch,imageSearchTimer,dragFiles,mediaJobs;
const recordingTrims=new Map();
function cancelRecordingTrims(){for(const controller of recordingTrims.values())controller.abort();}
function cancelNativePaste(){native.cancelPaste();cancelFileCopies();}
function refreshImageSearch(){if(!imageSearch||closing)return;clearTimeout(imageSearchTimer);imageSearchTimer=setTimeout(()=>imageSearch.refresh(),400);imageSearchTimer.unref?.();}
async function readSemanticImage(id){
 const file=store.posterPath(id),header=Buffer.alloc(24);let descriptor;
 try{descriptor=fs.openSync(file,'r');if(fs.readSync(descriptor,header,0,24,0)!==24)return null;}finally{if(descriptor!==undefined)fs.closeSync(descriptor);}
 const width=header.readUInt32BE(16),height=header.readUInt32BE(20),scale=Math.min(1,1024/Math.max(width,height));
 if(!width||!height||width*height>80_000_000||Math.min(width,height)*scale<120||Math.max(width,height)/Math.min(width,height)>4)return null;
 // Electron delegates thumbnail decoding to the OS asynchronously. Inference
 // and pixel conversion stay in the worker, keeping large PNGs off the UI loop.
 let image=await nativeImage.createThumbnailFromPath(file,{width:Math.max(1,Math.round(width*scale)),height:Math.max(1,Math.round(height*scale))});if(image.isEmpty())return null;
 const size=image.getSize(),fit=Math.min(1,1024/Math.max(size.width,size.height));if(fit<1)image=image.resize({width:Math.max(1,Math.round(size.width*fit)),height:Math.max(1,Math.round(size.height*fit)),quality:'best'});
 const resized=image.getSize();return{bitmap:image.toBitmap(),width:resized.width,height:resized.height};
}

function state(result) { return {...store.publicState(),version:app.getVersion(),build:BUILD_NUMBER,platform:process.platform,development,view,windowMode:view==='shelves'?'overlay':'normal',windowMaximized:window?.isMaximized()||false,windowVisible:window?.isVisible()||false,message:message||store.privacyWarning||'',viewEvent,imageSearch:{...(imageSearch?.state||{available:false,indexing:false,pending:0,revision:0})},update:{...updates.state},...(result===undefined?{}:{result})}; }
function broadcast() { if(window&&!window.isDestroyed())window.webContents.send('clipboardline:changed',state()); }
function notify(text) { message=text;broadcast(); }
function openUpdates(){return show('settings',{settingsTab:'updates'});}
function refreshTray(){
  if(!tray)return;const available=updates?.manifest;
  tray.setToolTip(available?`ClipBoardLine ${available.version} is available`:'ClipBoardLine');
  tray.setContextMenu(Menu.buildFromTemplate([{label:'Open shelves',click:()=>show('shelves')},{label:'Library',click:()=>show('library')},{label:'Capture screen',click:()=>capture()},{label:'Settings',click:()=>show('settings')},
    ...(available?[{label:`Update available: ${available.version}…`,click:openUpdates}]:[]),{label:'Check for updates…',click:async()=>{await openUpdates();await updates.check();}},{type:'separator'},{label:'Quit',click:()=>app.quit()}]));
}
function updateAvailable(manifest){
  refreshTray();if(testMode||!store.data.settings.autoCheckUpdates||!Notification.isSupported())return;
  const notice=new Notification({title:'ClipBoardLine update available',body:`ClipBoardLine ${manifest.version} is ready. Click to review and install.`,silent:true});notice.on('click',()=>void openUpdates());notice.show();
}
async function launchInstaller(file,args){const child=spawn(file,args,{detached:true,stdio:'ignore',windowsHide:true});await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});child.unref();}
function trusted(event) {
  if(!window || event.sender !== window.webContents || !event.senderFrame || event.senderFrame !== window.webContents.mainFrame || event.senderFrame.url !== entry) throw new Error('Untrusted application frame');
}
function rememberNormalBounds(){if(window&&view!=='shelves'&&!applyingBounds&&!window.isMinimized()){normalBounds=window.getNormalBounds();normalMaximized=window.isMaximized();}}
function fitNormalBounds(area){const width=Math.min(area.width,normalBounds?.width||1180),height=Math.min(area.height,normalBounds?.height||800);return{width,height,x:Math.min(area.x+area.width-width,Math.max(area.x,normalBounds?.x??Math.round(area.x+(area.width-width)/2))),y:Math.min(area.y+area.height-height,Math.max(area.y,normalBounds?.y??Math.round(area.y+(area.height-height)/2)))};}
async function show(next='shelves',event=null) {
  cancelRecordingTrims();
  if(pastePromise){pasteGeneration++;cancelNativePaste();}
  if(showing)return; showing=true;
  try {
    // A hidden window can still be restoring its previous native field.
    // Complete that operation before a rapid reopen captures and takes focus.
    if(hidePromise)await hidePromise;
    if(!window.isVisible() || !window.isFocused()) {
      const target=await native.capture().catch(()=>null);
      previous=pasteTargets.capture(target);
    }
    rememberNormalBounds();view=next;viewEvent=event?{...event,serial:crypto.randomUUID()}:null;message='';
    const display=screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    applyingBounds=true;
    try{if(window.isMinimized())window.restore();if(window.isMaximized())window.unmaximize();
      window.setMinimumSize(next==='shelves'?1:640,next==='shelves'?1:360);window.setResizable(next!=='shelves');window.setMaximizable(next!=='shelves');window.setSkipTaskbar(next==='shelves');
      window.setBackgroundColor(next==='shelves'?'#00000000':'#18191d');window.setHasShadow(next!=='shelves');
      window.setBounds(next==='shelves'?display.workArea:fitNormalBounds(display.workArea));if(next!=='shelves'&&normalMaximized)window.maximize();
    }finally{applyingBounds=false;}
    window.setAlwaysOnTop(next==='shelves');window.show();window.focus();broadcast();
  }finally{showing=false;}
}
async function hide(restore=true) {
  cancelRecordingTrims();
  if(restore&&pastePromise){pasteGeneration++;cancelNativePaste();}
  if(hidePromise)return hidePromise;
  const operation=(async()=>{
    rememberNormalBounds();const target=previous;previous=null;window.hide();viewEvent=null;broadcast();
    if(restore&&target)await native.restore(target).catch(()=>{});
  })();
  hidePromise=operation;
  try{await operation;}finally{if(hidePromise===operation)hidePromise=null;}
}
async function clipboardContent() {
  const entries=await clipboard.read(),formats=entries.flatMap(item=>item.types);if(privateClipboard(formats))return null;
  let owned=false;
  for(const entry of entries){for(const format of entry.types){
    if(format==='web application/x.clipboardline'){const value=Buffer.from(await(await entry.getType(format)).arrayBuffer());owned=value.equals(copyMarker);}
    if(format.includes('CanIncludeInClipboardHistory')){const value=Buffer.from(await(await entry.getType(format)).arrayBuffer());if(value.length>=4&&value.readUInt32LE(0)===0)return null;}
  }}
  const imageEntry=entries.find(item=>item.types.includes('image/png'));
  if(imageEntry){const blob=await imageEntry.getType('image/png');if(blob.size>64*1024*1024)return null;const bytes=Buffer.from(await blob.arrayBuffer());return{kind:'image',value:bytes,owned,fingerprint:'image:'+crypto.createHash('sha256').update(bytes).digest('hex')};}
  const value=await clipboard.readText();if(!value||value.length>1024*1024)return null;
  const url=plainURL(value);return{kind:url?'link':'text',value:url||value,owned,fingerprint:(url?'link:':'text:')+crypto.createHash('sha256').update(value).digest('hex')};
}
async function readClipboard() {
  if(capturing){pendingClipboard=true;return;}if(!store||closing||!['captureText','captureImages','captureLinks'].some(key=>store.data.settings[key]))return;capturing=true;
  try{
    const content=await clipboardContent();if(!content)return;
    if(content.fingerprint===lastFingerprint)return;lastFingerprint=content.fingerprint;
    if(content.fingerprint===ownFingerprint){ownFingerprint='';return;}
    if(content.owned)return;
    const key={image:'captureImages',text:'captureText',link:'captureLinks'}[content.kind];if(!store.data.settings[key])return;
    const item=store.insert(content.kind,content.value);broadcast();
    if(item.kind==='link')void enrich(item.id);
    if(item.kind==='image'){queueOCR(item.id);refreshImageSearch();}
    if(item.kind==='image'&&store.data.settings.openAfterScreenshot&&!window.isVisible())await show('shelves',{selectId:item.id,kind:'image'});
  }catch(error){notify('Clipboard capture: '+error.message);}finally{capturing=false;if(pendingClipboard){pendingClipboard=false;queueMicrotask(()=>void readClipboard());}}
}
async function enrich(id,{refresh=false}={}) {
  if(!store.data.settings.fetchLinkMetadata||(!refresh&&pending.has(id)))return;
  const generation=Symbol(id);pending.set(id,generation);
  const current=()=>pending.get(id)===generation&&store.data.settings.fetchLinkMetadata;
  try {
    const item=store.item(id),url=item.url;if(item.kind!=='link')return;
    if(refresh){delete item.thumbnailFile;delete item.author;item.title=new URL(url).hostname;store.persist();broadcast();}
    const metadata=await linkMetadata(url);
    if(!current()||!store.data.items.includes(item)||item.trashedAt||item.url!==url)return;
    let thumbnailFile='';
    if(metadata.thumbnail){try{const response=await metadataFetch(metadata.thumbnail,{maximum:2*1024*1024});const image=nativeImage.createFromBuffer(response.bytes);if(!image.isEmpty()){const size=image.getSize();if(size.width*size.height<=16_000_000)thumbnailFile=store.putPNG(image.resize({width:Math.min(size.width,640)}).toPNG());}}catch{}}
    if(!current()||!store.data.items.includes(item)||item.trashedAt||item.url!==url)return;
    item.title=metadata.title||new URL(url).hostname;item.author=metadata.author||'';if(thumbnailFile)item.thumbnailFile=thumbnailFile;store.persist();broadcast();
  }catch(error){if(refresh&&current())throw new Error('Link preview could not be refreshed: '+error.message);}
  finally{if(pending.get(id)===generation)pending.delete(id);}
}
async function writeClipboard(selected) {
  if(!selected.length)throw new Error('Select an item first');
  const images=selected.filter(item=>item.kind==='image');
  const values=selected.filter(item=>item.kind!=='image').map(item=>item.kind==='link'?item.url:item.text);
  if(images.some(item=>item.recording)){
    await copyFiles({files:images.map(item=>store.mediaPath(item.id)),marker:copyMarker.toString('base64'),text:values.join('\n\n')});
    ownFingerprint=(await clipboardContent())?.fingerprint||'';lastFingerprint=ownFingerprint;store.markCopied(selected.filter(item=>store.data.items.includes(item)).map(item=>item.id));return;
  }
  if(images.length>1){
    await native.copyImages({files:images.map(item=>store.mediaPath(item.id)),marker:copyMarker.toString('base64'),text:values.join('\n\n')});
    ownFingerprint=(await clipboardContent())?.fingerprint||'';lastFingerprint=ownFingerprint;store.markCopied(selected.filter(item=>store.data.items.includes(item)).map(item=>item.id));return;
  }
  const data={'web application/x.clipboardline':new Blob([copyMarker])};if(values.length)data['text/plain']=new Blob([values.join('\n\n')],{type:'text/plain'});
  if(images.length){const image=nativeImage.createFromPath(store.mediaPath(images[0].id));if(image.isEmpty())throw new Error('Image unavailable');data['image/png']=new Blob([image.toPNG()],{type:'image/png'});}
  await clipboard.write([new ClipboardItem(data)]);
  ownFingerprint=(await clipboardContent())?.fingerprint||'';lastFingerprint=ownFingerprint;store.markCopied(selected.filter(item=>store.data.items.includes(item)).map(item=>item.id));
}
async function copy(payload,paste=false) {
  if(pastePromise)return pastePromise;
  const selected=store.selected(ids(payload.ids));const target=previous;
  if(!selected.length)throw new Error('Select an item first');
  if(paste&&(!target||!target.editable||target.secure))throw new Error('Select an editable field in another application, then reopen the shelves.');
  if(paste){
    const generation=++pasteGeneration;
    const current=()=>{if(generation!==pasteGeneration)throw new Error('Paste canceled by another browsing action.');};
    const operation=(async()=>{try{
      await native.preparePaste(target);current();await hide(false);current();
      // The helper may have restored the field before hiding our source UI.
      // Validate the exact destination again after dismissal and before any
      // clipboard mutation, just as the native Mac coordinator does.
      await native.validatePaste(target);current();await writeClipboard(selected);current();
      await native.paste({...target,prepared:true});current();if(store.data.settings.sounds)shell.beep();
    }catch(error){if(generation===pasteGeneration)await show(view);throw error;}})();
    pastePromise=operation;try{return await operation;}finally{if(pastePromise===operation)pastePromise=null;}
  }
  await writeClipboard(selected);
  if(store.data.settings.sounds)shell.beep();
  if(payload.keepOpen&&!paste){notify('Copied');return;}
  await hide();
}
async function importFile(file) {
  const stat=fs.lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink())throw new Error('Select a regular file.');
  const extension=path.extname(file).toLowerCase();
  if(['.mov','.mp4'].includes(extension)){
    if(stat.size>MAXIMUM_VIDEO_BYTES)throw new Error('Recording exceeds the 2 GB import limit.');
    const inspected=await mediaJobs.probe(file);
    try{
      const after=fs.lstatSync(file);if(after.isSymbolicLink()||after.size!==stat.size||after.mtimeMs!==stat.mtimeMs||after.ino!==stat.ino)throw new Error('The recording changed while importing.');
      const item=await store.insertRecording(inspected);refreshImageSearch();return item;
    }finally{mediaJobs.release(inspected);}
  }
  if(stat.size>64*1024*1024)throw new Error('File exceeds import limit');
  if(['.txt','.md'].includes(extension)) {if(stat.size>1024*1024)throw new Error('Text file exceeds import limit');const value=fs.readFileSync(file,'utf8');return store.insert(plainURL(value)?'link':'text',value);}
  const image=nativeImage.createFromPath(file);if(image.isEmpty())throw new Error('Unsupported image file');const item=store.insert('image',image.toPNG());queueOCR(item.id);refreshImageSearch();return item;
}
async function capture() {
  const wasVisible=window.isVisible();if(wasVisible)window.hide();
  try{
    // Capture only after the shelf window has left the compositor.
    await new Promise(resolve=>setTimeout(resolve,150));
    const display=screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    const sources=await desktopCapturer.getSources({types:['screen'],thumbnailSize:{width:Math.round(display.size.width*display.scaleFactor),height:Math.round(display.size.height*display.scaleFactor)}});
    const source=sources.find(s=>s.display_id===String(display.id))||sources[0];if(!source||source.thumbnail.isEmpty())throw new Error('Screen capture is unavailable');
    const item=store.insert('image',source.thumbnail.toPNG());queueOCR(item.id);refreshImageSearch();await show('shelves',{selectId:item.id,kind:'image',preview:true,crop:true});return{id:item.id};
  }catch(error){if(wasVisible)await show(view);throw error;}
}
function queueOCR(id){if(testMode||!store.data.settings.indexImages||ocrQueue.includes(id)||ocrQueue.length>=64)return;ocrQueue.push(id);if(indexing)return;indexing=true;setImmediate(async()=>{try{while(ocrQueue.length&&!closing){const next=ocrQueue.shift(),item=store.data.items.find(i=>i.id===next);if(!item||item.trashedAt||item.ocrText)continue;const fingerprint=item.renderedFile||item.imageFile;try{await ocr(next,true);}catch{}if(store.data.items.includes(item)&&(item.renderedFile||item.imageFile)!==fingerprint&&!ocrQueue.includes(next))ocrQueue.push(next);}}finally{indexing=false;}});}
async function ocr(id,quiet=false){if(ocrJobs.has(id))return ocrJobs.get(id);const promise=recognize(id,quiet);ocrJobs.set(id,promise);try{return await promise;}finally{ocrJobs.delete(id);}}
async function recognize(id,quiet=false) {
  const item=store.item(id);if(item.kind!=='image'||item.recording)throw new Error('OCR requires a still image');
  const file=store.mediaPath(id);const fingerprint=item.renderedFile||item.imageFile;
  if(item.ocrText)return{text:item.ocrText,id};
  if(!quiet)notify('Recognizing image text locally…');
  const {createWorker}=require('tesseract.js');
  const languageDirectory=path.join(store.directory,'ocr-models');fs.mkdirSync(languageDirectory,{recursive:true});
  for(const language of ['eng','tur']) {
    const source=app.isPackaged?path.join(process.resourcesPath,'ocr-data',language,'4.0.0_best_int',language+'.traineddata.gz'):path.join(__dirname,'node_modules','@tesseract.js-data',language,'4.0.0_best_int',language+'.traineddata.gz');
    const destination=path.join(languageDirectory,language+'.traineddata.gz');if(!fs.existsSync(destination))fs.copyFileSync(source,destination);
  }
  const worker=await createWorker(['eng','tur'],1,{langPath:languageDirectory,cachePath:languageDirectory,gzip:true});
  try{let image=nativeImage.createFromPath(file);const size=image.getSize(),scale=Math.min(1,2400/Math.max(size.width,size.height));if(scale<1)image=image.resize({width:Math.round(size.width*scale),height:Math.round(size.height*scale)});const result=await worker.recognize(image.toPNG());if(!store.data.items.includes(item)||(item.renderedFile||item.imageFile)!==fingerprint)throw new Error('Image changed during recognition');item.ocrText=String(result.data.text||'').slice(0,1024*1024);store.persist();if(!quiet)notify(item.ocrText?'Image text ready':'No text found');else broadcast();return{text:item.ocrText,id};}
  finally{await worker.terminate();}
}
function configureWatchers() {
  for(const watcher of watchers)watcher.close();watchers=[];
  for(const folder of store.data.settings.watchFolders){try{if(!fs.statSync(folder).isDirectory())continue;const timers=new Map();const watcher=fs.watch(folder,(_event,name)=>{if(!name||!/[.](png|jpe?g|webp|bmp|mov|mp4)$/i.test(name))return;clearTimeout(timers.get(name));timers.set(name,setTimeout(()=>{timers.delete(name);try{const file=path.join(folder,path.basename(name));const item=importFile(file);Promise.resolve(item).then(record=>{broadcast();if(store.data.settings.openAfterScreenshot)void show('shelves',{selectId:record.id,kind:'image'});}).catch(()=>{});}catch{}},700));});watcher.on('error',()=>{});watchers.push(watcher);}catch{}}
}
let shortcutRegistry;
function configureShortcuts(previousPreferences=null) {
  shortcutRegistry??=new GlobalShortcuts(globalShortcut,{
    toggle:()=>window.isVisible()?hide():show('shelves'),
    search:()=>show('shelves',{search:true}),library:()=>show('library'),
    copyLatest:async()=>{const image=store.data.items.filter(item=>item.kind==='image'&&!item.trashedAt&&!item.hiddenFromShelf).sort((a,b)=>b.createdAt-a.createdAt)[0];if(image){await writeClipboard([image]);notify('Copied');if(store.data.settings.sounds)shell.beep();}},
    screenshot:capture
  },{failed:error=>notify(error.message)});
  const rejected=shortcutRegistry.update(store.data.settings.shortcuts);
  if(rejected.length){
    if(previousPreferences)store.modify('setSettings',{patch:{shortcuts:Object.fromEntries(rejected.map(value=>[value.action,previousPreferences[value.action]||'']))}});
    message='Shortcut '+rejected.map(value=>value.shortcut).join(', ')+' is unavailable. '+(rejected.some(value=>value.previous)?'Working previous shortcuts are kept.':'Choose another combination in Settings.');
  }
  return rejected;
}

const modelActions=new Set(['pin','name','details','retain','note','unassign','removeTag','renameTag','deleteTag','folder','createFolder','renameFolder','removeFolder','tag','remove','undo','trash','restore','delete','editText','saveImage','cleanup']);
async function command(action,payload={}) {
  if(typeof action!=='string'||!payload||typeof payload!=='object'||Array.isArray(payload)||JSON.stringify(payload).length>92_000_000)throw new Error('Invalid command');
  message='';let result;
  if(modelActions.has(action)){if(action==='saveImage'){if(typeof payload.dataUrl!=='string'||payload.dataUrl.length>90_000_000)throw new Error('Invalid edited image');const decoded=nativeImage.createFromDataURL(payload.dataUrl);if(decoded.isEmpty()||decoded.getSize().width*decoded.getSize().height>80_000_000)throw new Error('Invalid edited image');}result=store.modify(action,payload);if(action==='saveImage')queueOCR(payload.id);if(['saveImage','remove','delete','trash','restore','undo','cleanup'].includes(action))refreshImageSearch();if(action==='remove'||action==='trash'||action==='delete')viewEvent={removedIds:payload.ids||[payload.id],serial:crypto.randomUUID()};}
  else if(action==='show'||action==='search')await show('shelves',action==='search'?{search:true}:null);
  else if(action==='hide'){if(pastePromise){pasteGeneration++;cancelNativePaste();}await hide();}
  else if(action==='library'||action==='settings')await show(action);
  else if(action==='windowClose'){if(pastePromise){pasteGeneration++;cancelNativePaste();}await hide();}
  else if(action==='windowMinimize'){if(view!=='shelves'){rememberNormalBounds();window.minimize();}}
  else if(action==='windowMaximize'){if(view!=='shelves'){if(window.isMaximized())window.unmaximize();else window.maximize();rememberNormalBounds();}}
  else if(action==='copy'||action==='paste')await copy(payload,action==='paste');
  else if(action==='cancelTrim'){recordingTrims.get(payload.id)?.abort();result={canceled:true};}
  else if(action==='trimRecording'){
    const item=store.item(payload.id);
    if(!item.recording||item.trashedAt||recordingTrims.has(item.id))throw new Error('Select an available recording.');
    const fingerprint=(item.renderedVideoFile||item.videoFile).slice(0,64);
    if(payload.sourceFingerprint!==fingerprint)throw new Error('The recording changed. Reopen its preview before trimming.');
    if(!Number.isFinite(payload.startMs)||!Number.isFinite(payload.endMs)||payload.startMs<0||payload.endMs>item.durationMs||payload.endMs-payload.startMs<50)throw new Error('Choose a nonempty interval within this recording.');
    const controller=new AbortController();recordingTrims.set(item.id,controller);let trimmed;
    try{
      trimmed=await mediaJobs.trim(store.mediaPath(item.id),{startMs:payload.startMs,endMs:payload.endMs,signal:controller.signal});
      if(controller.signal.aborted)throw new Error('Video operation canceled.');
      await store.commitRecordingTrim({id:item.id,sourceFingerprint:fingerprint,...trimmed,signal:controller.signal});
      result={id:item.id};refreshImageSearch();
    }finally{recordingTrims.delete(item.id);if(trimmed)mediaJobs.release(trimmed);}
  }
  else if(action==='openLink'){const item=store.item(payload.id);const url=plainURL(item.url);if(item.kind!=='link'||!url)throw new Error('Link unavailable');await shell.openExternal(url);}
  else if(action==='openFile'||action==='revealFile'){
    const item=store.item(payload.id);if(item.kind!=='image')throw new Error('Select an image first.');
    const file=store.mediaPath(item.id);if(action==='revealFile')shell.showItemInFolder(file);else {const failure=await shell.openPath(file);if(failure)throw new Error('The image could not be opened.');}
  }
  else if(action==='refreshLink'){
    const item=store.item(payload.id);if(item.kind!=='link')throw new Error('Select a link first.');
    if(!store.data.settings.fetchLinkMetadata)throw new Error('Enable link metadata in Sources before refreshing link previews.');
    // Invalidate the in-flight job by identity; its completion must not replace
    // the new request's title or thumbnail after the user explicitly refreshes.
    await enrich(item.id,{refresh:true});result={id:item.id};
  }
  else if(action==='capture')result=await capture();
  else if(action==='newNote'){const item=store.insert('text',payload.text||'New note');if(payload.title)store.modify('details',{id:item.id,name:payload.title});store.modify('retain',{ids:[item.id]});result={id:item.id};}
  else if(action==='import'){const response=await dialog.showOpenDialog(window,{properties:['openFile','multiSelections'],filters:[{name:'Images, recordings and text',extensions:['png','jpg','jpeg','webp','bmp','mov','mp4','txt','md']}]});const imported=[];for(const file of response.filePaths){const item=await importFile(file);imported.push(item.id);if(item.kind==='link')void enrich(item.id);}result={ids:imported};}
  else if(action==='searchImages'){if(!imageSearch)throw new Error('Offline image search is unavailable.');result=await imageSearch.search(payload.query,payload.eligibleIds);}
  else if(action==='ocr')result=await ocr(payload.id);
  else if(action==='copyOCR'){const recognized=await ocr(payload.id);if(!recognized.text.trim())throw new Error('No text found in this image.');await writeClipboard([{kind:'text',text:recognized.text}]);result=recognized;notify('Recognized text copied');}
  else if(action==='export'){
    const selected=store.selected(ids(payload.ids));if(!selected.length)throw new Error('Select an item first');
    const response=await dialog.showOpenDialog(window,{properties:['openDirectory','createDirectory']});if(response.filePaths[0]){
      for(const item of selected){const label=(item.name||item.title||item.kind).replace(/[<>:"/\\|?*\x00-\x1F]/g,'-').replace(/[. ]+$/g,'').slice(0,100)||item.kind;const extension=item.kind==='image'?(item.recording?path.extname(store.mediaPath(item.id)):'.png'):item.kind==='link'?'.url':'.txt';let index=1,destination;
        do{destination=path.join(response.filePaths[0],label+(index>1?'-'+index:'')+extension);index++;}while(fs.existsSync(destination));
        if(item.kind==='image')await fs.promises.copyFile(store.mediaPath(item.id),destination,fs.constants.COPYFILE_EXCL);
        else fs.writeFileSync(destination,Buffer.from(item.kind==='link'?'[InternetShortcut]\r\nURL='+item.url+'\r\n':item.text),{flag:'wx'});
      }result={count:selected.length};message=`Exported ${selected.length} items.`;
    }
  }
  else if(action==='startDrag'){
    const selected=store.selected(ids(payload.ids));if(!selected.length||selected.length>1000)throw new Error('Select up to 1000 items to drag.');
    dragFiles??=new DragFiles(store.directory);const batch=dragFiles.prepare(selected,id=>store.mediaPath(id));
    const image=selected.find(item=>item.kind==='image'),icon=image?nativeImage.createFromPath(store.posterPath(image.id)).resize({width:64}):appIcon();
    try{window.webContents.startDrag({files:batch.files,icon});}catch(error){if(batch.batch)dragFiles.remove(batch.batch);throw error;}
  }
  else if(action==='setSettings'){
    const patch={...payload.patch};
    if(Object.hasOwn(patch,'watchFolders'))throw new Error('Choose watched folders with the folder picker.');
    const previousShortcuts={...store.data.settings.shortcuts};
    store.modify('setSettings',{patch});if(Object.hasOwn(patch,'retentionDays'))refreshImageSearch();if(Object.hasOwn(patch,'shortcuts')&&configureShortcuts(previousShortcuts).length)result={error:message};
    if(['captureText','captureImages','captureLinks'].some(key=>Object.hasOwn(patch,key)))lastFingerprint='';
    if(Object.hasOwn(patch,'launchAtLogin')&&!testMode)app.setLoginItemSettings({openAtLogin:patch.launchAtLogin});
    if(Object.hasOwn(patch,'autoCheckUpdates')&&patch.autoCheckUpdates&&!development)void updateScheduler.tick({force:true});
  }else if(action==='watchFolder'||action==='chooseWatchFolder'){const response=await dialog.showOpenDialog(window,{properties:['openDirectory']});if(response.filePaths[0]){store.modify('setSettings',{patch:{watchFolders:[...store.data.settings.watchFolders,response.filePaths[0]]}});configureWatchers();}}
  else if(action==='unwatchFolder'){const index=payload.index;if(!Number.isInteger(index)||index<0||index>=store.data.settings.watchFolders.length)throw new Error('Invalid watched folder');store.modify('setSettings',{patch:{watchFolders:store.data.settings.watchFolders.filter((_v,i)=>i!==index)}});configureWatchers();}
  else if(action==='checkUpdates'||action==='refreshUpdates'){if(development)updates.set({status:'development',message:'Development builds use a separate library. Install an official release to use its signed update channel.'});else await updates.check({force:action==='checkUpdates'});}
  else if(action==='installUpdate'){
    if(development)throw new Error('Development builds cannot install official updates.');
    if(process.platform!=='win32')throw new Error('Windows installer can run only on Windows.');
    await updates.install(launchInstaller);app.quit();
  }else if(action==='quit')app.quit();
  else throw new Error('Unknown command');
  broadcast();return state(result);
}

function appIcon(){const bitmap=Buffer.alloc(16*16*4);for(let y=2;y<14;y++)for(let x=3;x<13;x++){const at=(y*16+x)*4;bitmap[at]=245;bitmap[at+1]=137;bitmap[at+2]=61;bitmap[at+3]=255;if(x>5&&x<10&&y<5){bitmap[at]=255;bitmap[at+1]=255;bitmap[at+2]=255;}}return nativeImage.createFromBitmap(bitmap,{width:16,height:16});}
if(!app.requestSingleInstanceLock())app.quit();
else app.whenReady().then(async()=>{
  store=new Store(app.getPath('userData'));mediaJobs=new MediaJobs({directory:path.join(store.directory,'media-jobs')});try{dragFiles=new DragFiles(store.directory);}catch{}updates=new Updates(path.join(store.directory,'updates'),{build:BUILD_NUMBER,version:app.getVersion(),changed:()=>{broadcast();refreshTray();},available:updateAvailable});
  updateScheduler=new AutomaticUpdateScheduler(updates,{enabled:()=>!development&&!testMode&&store.data.settings.autoCheckUpdates});
  const searchPaths=modelPaths({packaged:app.isPackaged,resourcesPath:process.resourcesPath,sourceDirectory:__dirname});
  let ortModule=null,runtimeDirectory=null;try{ortModule=require.resolve('onnxruntime-web/wasm').replace(/app[.]asar([\\/])/,'app.asar.unpacked$1');runtimeDirectory=path.dirname(ortModule);}catch{}
  imageSearch=new ImageSearch({...searchPaths,ortModule,runtimeDirectory,cacheDirectory:path.join(store.directory,'image-search'),items:()=>store.data.items,readImage:readSemanticImage,changed:()=>broadcast()});refreshImageSearch();
  protocol.handle('appmedia',async request=>{
    try{
      if(testMode&&mediaDiagnostics.length<100)mediaDiagnostics.push({method:request.method,origin:request.headers.get('Origin'),initiator:request.initiatorOrigin??null});
      // CORS permits the local editor to export its canvas.
      // Sender/frame controls remain the application authorization boundary;
      // origin checks here also reject remote-site media reads.
      const corsOrigin=mediaOrigin({method:request.method,origin:request.headers.get('Origin'),initiator:request.initiatorOrigin});
      if(!corsOrigin)return new WebResponse('Not found',{status:404});
      const url=new URL(request.url);const match=/^\/([0-9a-f-]{36})(\/original|\/thumbnail|\/video(?:\/original)?)?$/.exec(url.pathname);
      if(url.hostname!=='media'||!match||url.hash)return new WebResponse('Not found',{status:404});
      let file,mime='image/png';
      if(match[2]==='/thumbnail'){const item=store.item(match[1]);if(!/^[a-f0-9]{64}\.png$/.test(item.thumbnailFile||''))return new WebResponse('Not found',{status:404});file=path.join(store.mediaDirectory,item.thumbnailFile);if(fs.lstatSync(file).isSymbolicLink())return new WebResponse('Not found',{status:404});}
      else if(match[2]?.startsWith('/video')){const item=store.item(match[1]);if(!item.recording)return new WebResponse('Not found',{status:404});file=store.mediaPath(item.id,match[2]==='/video/original');mime=path.extname(file)==='.mov'?'video/quicktime':'video/mp4';}
      else file=store.posterPath(match[1],match[2]==='/original');
      if(!mediaGenerationMatches(url.search,match[2],file))return new WebResponse('Not found',{status:404});
      return mediaResponse(file,{mime,origin:corsOrigin,range:request.headers.get('Range'),Response:WebResponse});
    }catch{return new WebResponse('Not found',{status:404});}
  });
  window=new BrowserWindow({width:1200,height:760,minWidth:1,minHeight:1,show:false,frame:false,transparent:true,backgroundColor:'#00000000',hasShadow:false,skipTaskbar:true,alwaysOnTop:true,icon:appIcon(),
    webPreferences:{preload:path.join(__dirname,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,devTools:testMode}});
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  window.webContents.on('will-navigate',(event,url)=>{if(url!==entry)event.preventDefault();});
  window.webContents.on('will-frame-navigate',event=>{if(!event.isMainFrame||event.url!==entry)event.preventDefault();});
  window.webContents.on('will-attach-webview',event=>event.preventDefault());
  window.webContents.session.setPermissionRequestHandler((_contents,_permission,callback)=>callback(false));
  window.on('focus',()=>{if(!showing&&!pastePromise)previous=pasteTargets.reenter();});
  window.on('close',event=>{if(!closing){event.preventDefault();void hide();}});
  window.on('resize',()=>{rememberNormalBounds();broadcast();});window.on('move',rememberNormalBounds);window.on('maximize',()=>{rememberNormalBounds();broadcast();});window.on('unmaximize',()=>{rememberNormalBounds();broadcast();});
  ipcMain.handle('clipboardline:state',event=>{trusted(event);return state();});
  ipcMain.handle('clipboardline:command',async(event,action,payload)=>{trusted(event);try{return await command(action,payload);}catch(error){notify(error.message);return state({error:error.message});}});
  await window.loadURL(entry);
  monitor=native.monitor(()=>{if(!testMode)void readClipboard();},error=>{monitor?.kill();monitor=null;pasteTargets.clear();if(!closing)notify(error.message+' Falling back to bounded clipboard polling.');},focus=>pasteTargets.observe(focus));
  if(!testMode){
    const icon=appIcon();
    if(process.platform==='win32')app.setAppUserModelId('com.clipboardline.desktop.windows');
    tray=new Tray(icon);refreshTray();tray.on('click',()=>window.isVisible()?hide():show('shelves'));updates.announce();
    configureShortcuts();configureWatchers();

    clipboardTimer=setInterval(()=>{if(!monitor)void readClipboard();},1000);
    retentionTimer=setInterval(()=>{store.expire();refreshImageSearch();broadcast();},3600000);
    updateTimer=setInterval(()=>void updateScheduler.tick(),60000);
    updateLaunchTimer=setTimeout(()=>void updateScheduler.tick(),10000);updateLaunchTimer.unref();
    powerMonitor.on('resume',()=>void updateScheduler.tick());
  }
  await show('shelves');
  // Test hooks are main-process only and require an explicit isolated data path.
  if(testMode&&testFolder)global.__clipboardLineTest={store,command,state,readClipboard,writeClipboard,clipboardContent,privateClipboard,importFile,getMediaJobs:()=>mediaJobs,getWindow:()=>window,getTarget:()=>previous,setTarget:value=>{previous=value;},getObservedTarget:()=>pasteTargets.reenter(),getImageSearch:()=>imageSearch,getMediaDiagnostics:()=>mediaDiagnostics.map(value=>({...value})),enableShortcuts:configureShortcuts,getUpdates:()=>updates,setUpdates:value=>{updates=value;updates.changed=()=>{broadcast();refreshTray();};updates.available=updateAvailable;updateScheduler=new AutomaticUpdateScheduler(updates,{enabled:()=>store.data.settings.autoCheckUpdates});},getUpdateScheduler:()=>updateScheduler,capture,native};
}).catch(error=>{dialog.showErrorBox('ClipBoardLine could not start',error.message);app.exit(1);});
app.on('second-instance',()=>{if(window)void show('shelves');});
app.on('activate',()=>{if(window)void show('shelves');});
app.on('before-quit',()=>{closing=true;cancelRecordingTrims();mediaJobs?.dispose();dragFiles?.dispose();clearTimeout(imageSearchTimer);void imageSearch?.stop();clearInterval(clipboardTimer);clearInterval(retentionTimer);clearInterval(updateTimer);clearTimeout(updateLaunchTimer);monitor?.kill();watchers.forEach(w=>w.close());shortcutRegistry?.dispose();globalShortcut.unregisterAll();});
