'use strict';
const {app,BrowserWindow,ipcMain,clipboard,ClipboardItem,nativeImage,protocol,net,Tray,Menu,globalShortcut,screen,desktopCapturer,dialog,shell} = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {pathToFileURL} = require('node:url');
const {spawn} = require('node:child_process');
const {Store,plainURL,ids} = require('./lib/model.cjs');
const {privateClipboard}=require('./lib/clipboard-policy.cjs');
const native = require('./lib/native.cjs');
const {metadataFetch,linkMetadata} = require('./lib/network.cjs');
const {Updates} = require('./lib/updates.cjs');
const testMode = process.argv.includes('--test-mode');
const testFolder = process.argv.find(value=>value.startsWith('--test-data='))?.slice('--test-data='.length);
if(testMode && testFolder) app.setPath('userData',path.resolve(testFolder));
const development=!app.isPackaged&&!testMode;
if(development){const directory=path.join(app.getPath('appData'),'ClipBoardLine Dev');fs.mkdirSync(directory,{recursive:true,mode:0o700});app.setPath('userData',directory);}
app.setName(development?'ClipBoardLine Dev':'ClipBoardLine');
protocol.registerSchemesAsPrivileged([{scheme:'appmedia',privileges:{standard:true,secure:true,supportFetchAPI:true,stream:true}}]);
let window,store,tray,updates,monitor,clipboardTimer,retentionTimer,updateTimer,previous=null,view='shelves',message='',viewEvent=null;
let lastFingerprint='',ownFingerprint='',capturing=false,pendingClipboard=false,showing=false,closing=false,lastChecked=0,watchers=[];
const entry = pathToFileURL(path.join(__dirname,'index.html')).href;
const copyMarker = crypto.randomBytes(16);
const pending = new Set();
const ocrJobs=new Map(),ocrQueue=[];let indexing=false;

function state(result) { return {...store.publicState(),version:app.getVersion(),build:62,platform:process.platform,development,view,windowVisible:window?.isVisible()||false,message:message||store.privacyWarning||'',viewEvent,update:{...updates.state},...(result===undefined?{}:{result})}; }
function broadcast() { if(window&&!window.isDestroyed())window.webContents.send('clipboardline:changed',state()); }
function notify(text) { message=text;broadcast(); }
function trusted(event) {
  if(!window || event.sender !== window.webContents || !event.senderFrame || event.senderFrame !== window.webContents.mainFrame || event.senderFrame.url !== entry) throw new Error('Untrusted application frame');
}
async function show(next='shelves',event=null) {
  if(showing)return; showing=true;
  try {
    if(!window.isVisible() || !window.isFocused()) {
      const target=await native.capture().catch(()=>null);
      if(target && target.processId!==process.pid)previous=target;
    }
    view=next;viewEvent=event?{...event,serial:crypto.randomUUID()}:null;message='';
    const display=screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    if(next==='shelves') {const rows=Math.max(1,store.data.settings.visibleKinds.length);window.setBounds({x:display.workArea.x+24,y:display.workArea.y+24,width:Math.max(640,display.workArea.width-48),height:Math.min(display.workArea.height-48,180+rows*190)});}
    else {const width=Math.min(1280,display.workArea.width-64),height=Math.min(900,display.workArea.height-64);window.setBounds({x:Math.round(display.workArea.x+(display.workArea.width-width)/2),y:Math.round(display.workArea.y+(display.workArea.height-height)/2),width,height});}
    window.setAlwaysOnTop(next==='shelves');window.show();window.focus();broadcast();
  }finally{showing=false;}
}
async function hide(restore=true) {
  const target=previous;previous=null;window.hide();viewEvent=null;broadcast();
  if(restore&&target)await native.restore(target).catch(()=>{});
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
    if(item.kind==='image')queueOCR(item.id);
    if(item.kind==='image'&&store.data.settings.openAfterScreenshot&&!window.isVisible())await show('shelves',{selectId:item.id,kind:'image'});
  }catch(error){notify('Clipboard capture: '+error.message);}finally{capturing=false;if(pendingClipboard){pendingClipboard=false;queueMicrotask(()=>void readClipboard());}}
}
async function enrich(id) {
  if(!store.data.settings.fetchLinkMetadata||pending.has(id))return;pending.add(id);
  try {
    const item=store.item(id),url=item.url;const metadata=await linkMetadata(url);
    if(!store.data.settings.fetchLinkMetadata||!store.data.items.includes(item)||item.url!==url)return;
    let thumbnailFile='';
    if(metadata.thumbnail){try{const response=await metadataFetch(metadata.thumbnail,{maximum:2*1024*1024});const image=nativeImage.createFromBuffer(response.bytes);if(!image.isEmpty()){const size=image.getSize();if(size.width*size.height<=16_000_000)thumbnailFile=store.putPNG(image.resize({width:Math.min(size.width,640)}).toPNG());}}catch{}}
    if(!store.data.settings.fetchLinkMetadata||!store.data.items.includes(item)||item.url!==url)return;
    item.title=metadata.title||new URL(url).hostname;item.author=metadata.author||'';if(thumbnailFile)item.thumbnailFile=thumbnailFile;store.persist();broadcast();
  }catch{}finally{pending.delete(id);}
}
async function writeClipboard(selected) {
  if(!selected.length)throw new Error('Select an item first');
  const images=selected.filter(item=>item.kind==='image');
  const values=selected.filter(item=>item.kind!=='image').map(item=>item.kind==='link'?item.url:item.text);
  if(images.length>1){
    await native.copyImages({files:images.map(item=>store.mediaPath(item.id)),marker:copyMarker.toString('base64'),text:values.join('\n\n')});
    ownFingerprint=(await clipboardContent())?.fingerprint||'';lastFingerprint=ownFingerprint;return;
  }
  const data={'web application/x.clipboardline':new Blob([copyMarker])};if(values.length)data['text/plain']=new Blob([values.join('\n\n')],{type:'text/plain'});
  if(images.length){const image=nativeImage.createFromPath(store.mediaPath(images[0].id));if(image.isEmpty())throw new Error('Image unavailable');data['image/png']=new Blob([image.toPNG()],{type:'image/png'});}
  await clipboard.write([new ClipboardItem(data)]);
  ownFingerprint=(await clipboardContent())?.fingerprint||'';lastFingerprint=ownFingerprint;
}
async function copy(payload,paste=false) {
  const selected=store.selected(ids(payload.ids));const target=previous;
  if(paste&&(!target||!target.editable||target.secure))throw new Error('Select an editable field in another application, then reopen the shelves.');
  await writeClipboard(selected);
  if(store.data.settings.sounds)shell.beep();
  if(payload.keepOpen&&!paste){notify('Copied');return;}
  await hide(!paste);
  if(paste){try{await native.paste(target);}catch(error){await show(view);throw error;}}
}
async function importFile(file) {
  const stat=fs.statSync(file);if(!stat.isFile()||stat.size>64*1024*1024)throw new Error('File exceeds import limit');
  const extension=path.extname(file).toLowerCase();
  if(['.txt','.md'].includes(extension)) {if(stat.size>1024*1024)throw new Error('Text file exceeds import limit');const value=fs.readFileSync(file,'utf8');return store.insert(plainURL(value)?'link':'text',value);}
  const image=nativeImage.createFromPath(file);if(image.isEmpty())throw new Error('Unsupported image file');const item=store.insert('image',image.toPNG());queueOCR(item.id);return item;
}
async function capture() {
  const wasVisible=window.isVisible();if(wasVisible)window.hide();
  try{
    // Capture only after the shelf window has left the compositor.
    await new Promise(resolve=>setTimeout(resolve,150));
    const display=screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    const sources=await desktopCapturer.getSources({types:['screen'],thumbnailSize:{width:Math.round(display.size.width*display.scaleFactor),height:Math.round(display.size.height*display.scaleFactor)}});
    const source=sources.find(s=>s.display_id===String(display.id))||sources[0];if(!source||source.thumbnail.isEmpty())throw new Error('Screen capture is unavailable');
    const item=store.insert('image',source.thumbnail.toPNG());queueOCR(item.id);await show('shelves',{selectId:item.id,kind:'image',preview:true,crop:true});return{id:item.id};
  }catch(error){if(wasVisible)await show(view);throw error;}
}
function queueOCR(id){if(testMode||!store.data.settings.indexImages||ocrQueue.includes(id)||ocrQueue.length>=64)return;ocrQueue.push(id);if(indexing)return;indexing=true;setImmediate(async()=>{try{while(ocrQueue.length&&!closing){const next=ocrQueue.shift(),item=store.data.items.find(i=>i.id===next);if(!item||item.trashedAt||item.ocrText)continue;const fingerprint=item.renderedFile||item.imageFile;try{await ocr(next,true);}catch{}if(store.data.items.includes(item)&&(item.renderedFile||item.imageFile)!==fingerprint&&!ocrQueue.includes(next))ocrQueue.push(next);}}finally{indexing=false;}});}
async function ocr(id,quiet=false){if(ocrJobs.has(id))return ocrJobs.get(id);const promise=recognize(id,quiet);ocrJobs.set(id,promise);try{return await promise;}finally{ocrJobs.delete(id);}}
async function recognize(id,quiet=false) {
  const item=store.item(id);if(item.kind!=='image')throw new Error('OCR requires an image');
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
  for(const folder of store.data.settings.watchFolders){try{if(!fs.statSync(folder).isDirectory())continue;const timers=new Map();const watcher=fs.watch(folder,(_event,name)=>{if(!name||!/[.](png|jpe?g|webp|bmp)$/i.test(name))return;clearTimeout(timers.get(name));timers.set(name,setTimeout(()=>{timers.delete(name);try{const file=path.join(folder,path.basename(name));const item=importFile(file);Promise.resolve(item).then(record=>{broadcast();if(store.data.settings.openAfterScreenshot)void show('shelves',{selectId:record.id,kind:'image'});}).catch(()=>{});}catch{}},700));});watcher.on('error',()=>{});watchers.push(watcher);}catch{}}
}
function configureShortcuts() {
  globalShortcut.unregisterAll();
  for(const [action,shortcut]of Object.entries(store.data.settings.shortcuts)){if(!shortcut)continue;let okay=false;try{okay=globalShortcut.register(shortcut,()=>{if(action==='screenshot')void capture().catch(error=>notify(error.message));else if(action==='search')void show('shelves',{search:true});else if(window.isVisible())void hide();else void show('shelves');});}catch{}
    if(!okay)message=`Shortcut ${shortcut} is unavailable. Choose another in Settings.`;
  }
}
const modelActions=new Set(['pin','name','folder','createFolder','renameFolder','removeFolder','tag','remove','undo','trash','restore','delete','editText','saveImage','cleanup']);
async function command(action,payload={}) {
  if(typeof action!=='string'||!payload||typeof payload!=='object'||Array.isArray(payload)||JSON.stringify(payload).length>92_000_000)throw new Error('Invalid command');
  message='';let result;
  if(modelActions.has(action)){if(action==='saveImage'){if(typeof payload.dataUrl!=='string'||payload.dataUrl.length>90_000_000)throw new Error('Invalid edited image');const decoded=nativeImage.createFromDataURL(payload.dataUrl);if(decoded.isEmpty()||decoded.getSize().width*decoded.getSize().height>80_000_000)throw new Error('Invalid edited image');}result=store.modify(action,payload);if(action==='saveImage')queueOCR(payload.id);if(action==='remove'||action==='trash'||action==='delete')viewEvent={removedIds:payload.ids||[payload.id],serial:crypto.randomUUID()};}
  else if(action==='show'||action==='search')await show('shelves',action==='search'?{search:true}:null);
  else if(action==='hide')await hide();
  else if(action==='library'||action==='settings')await show(action);
  else if(action==='copy'||action==='paste')await copy(payload,action==='paste');
  else if(action==='openLink'){const item=store.item(payload.id);const url=plainURL(item.url);if(item.kind!=='link'||!url)throw new Error('Link unavailable');await shell.openExternal(url);}
  else if(action==='capture')result=await capture();
  else if(action==='newNote'){const item=store.insert('text',payload.text||'New note');if(payload.title)store.modify('name',{id:item.id,name:payload.title});else store.modify('pin',{ids:[item.id],value:true});result={id:item.id};}
  else if(action==='import'){const response=await dialog.showOpenDialog(window,{properties:['openFile','multiSelections'],filters:[{name:'Images and text',extensions:['png','jpg','jpeg','webp','bmp','txt','md']}]});const imported=[];for(const file of response.filePaths){const item=await importFile(file);imported.push(item.id);if(item.kind==='link')void enrich(item.id);}result={ids:imported};}
  else if(action==='ocr')result=await ocr(payload.id);
  else if(action==='copyOCR'){const recognized=await ocr(payload.id);if(!recognized.text.trim())throw new Error('No text found in this image.');await writeClipboard([{kind:'text',text:recognized.text}]);result=recognized;notify('Recognized text copied');}
  else if(action==='export'){
    const selected=store.selected(ids(payload.ids));if(!selected.length)throw new Error('Select an item first');
    const response=await dialog.showOpenDialog(window,{properties:['openDirectory','createDirectory']});if(response.filePaths[0]){
      for(const item of selected){const label=(item.name||item.title||item.kind).replace(/[<>:"/\\|?*\x00-\x1F]/g,'-').replace(/[. ]+$/g,'').slice(0,100)||item.kind;const extension=item.kind==='image'?'.png':item.kind==='link'?'.url':'.txt';let index=1,destination;
        do{destination=path.join(response.filePaths[0],label+(index>1?'-'+index:'')+extension);index++;}while(fs.existsSync(destination));
        const bytes=item.kind==='image'?fs.readFileSync(store.mediaPath(item.id)):Buffer.from(item.kind==='link'?'[InternetShortcut]\r\nURL='+item.url+'\r\n':item.text);fs.writeFileSync(destination,bytes,{flag:'wx'});
      }result={count:selected.length};message=`Exported ${selected.length} items.`;
    }
  }
  else if(action==='startDrag'){
    const selected=store.selected(ids(payload.ids));if(!selected.length||selected.length>1000)throw new Error('Select up to 1000 items to drag.');
    const directory=path.join(store.directory,'drag');fs.mkdirSync(directory,{recursive:true,mode:0o700});
    const files=selected.map(item=>{if(item.kind==='image')return store.mediaPath(item.id);const file=path.join(directory,item.id+(item.kind==='link'?'.url':'.txt'));fs.writeFileSync(file,item.kind==='link'?'[InternetShortcut]\r\nURL='+item.url+'\r\n':item.text,{mode:0o600});return file;});
    const image=selected.find(item=>item.kind==='image'),icon=image?nativeImage.createFromPath(store.mediaPath(image.id)).resize({width:64}):appIcon();window.webContents.startDrag({files,icon});
  }
  else if(action==='setSettings'){
    const patch={...payload.patch};
    if(Object.hasOwn(patch,'watchFolders'))throw new Error('Choose watched folders with the folder picker.');
    store.modify('setSettings',{patch});configureShortcuts();
    if(['captureText','captureImages','captureLinks'].some(key=>Object.hasOwn(patch,key)))lastFingerprint='';
    if(Object.hasOwn(patch,'launchAtLogin')&&!testMode)app.setLoginItemSettings({openAtLogin:patch.launchAtLogin});
    if(Object.hasOwn(patch,'autoCheckUpdates')&&patch.autoCheckUpdates&&!development)void updates.check();
  }else if(action==='watchFolder'||action==='chooseWatchFolder'){const response=await dialog.showOpenDialog(window,{properties:['openDirectory']});if(response.filePaths[0]){store.modify('setSettings',{patch:{watchFolders:[...store.data.settings.watchFolders,response.filePaths[0]]}});configureWatchers();}}
  else if(action==='unwatchFolder'){const index=payload.index;if(!Number.isInteger(index)||index<0||index>=store.data.settings.watchFolders.length)throw new Error('Invalid watched folder');store.modify('setSettings',{patch:{watchFolders:store.data.settings.watchFolders.filter((_v,i)=>i!==index)}});configureWatchers();}
  else if(action==='checkUpdates'){if(development)updates.set({status:'development',message:'Development builds use a separate library. Install an official release to use its signed update channel.'});else await updates.check();}
  else if(action==='installUpdate'){
    if(development)throw new Error('Development builds cannot install official updates.');
    if(process.platform!=='win32')throw new Error('Windows installer can run only on Windows.');
    const destination=await updates.download();
    const bytes=fs.readFileSync(destination),manifest=updates.manifest;
    if(!manifest||bytes.length!==manifest.size||crypto.createHash('sha256').update(bytes).digest('hex')!==manifest.sha256||fs.lstatSync(destination).isSymbolicLink())throw new Error('Installer changed after verification');
    const child=spawn(destination,['/S'],{detached:true,stdio:'ignore',windowsHide:true});await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});child.unref();app.quit();
  }else if(action==='quit')app.quit();
  else throw new Error('Unknown command');
  broadcast();return state(result);
}

function appIcon(){const bitmap=Buffer.alloc(16*16*4);for(let y=2;y<14;y++)for(let x=3;x<13;x++){const at=(y*16+x)*4;bitmap[at]=245;bitmap[at+1]=137;bitmap[at+2]=61;bitmap[at+3]=255;if(x>5&&x<10&&y<5){bitmap[at]=255;bitmap[at+1]=255;bitmap[at+2]=255;}}return nativeImage.createFromBitmap(bitmap,{width:16,height:16});}
if(!app.requestSingleInstanceLock())app.quit();
else app.whenReady().then(async()=>{
  store=new Store(app.getPath('userData'));updates=new Updates(path.join(store.directory,'updates'),{changed:broadcast});
  protocol.handle('appmedia',async request=>{
    try{
      const url=new URL(request.url);const match=/^\/([0-9a-f-]{36})(\/original|\/thumbnail)?$/.exec(url.pathname);
      if(url.hostname!=='media'||!match||url.search||url.hash)return new Response('Not found',{status:404});
      let file;
      if(match[2]==='/thumbnail'){const item=store.item(match[1]);if(!/^[a-f0-9]{64}\.png$/.test(item.thumbnailFile||''))return new Response('Not found',{status:404});file=path.join(store.mediaDirectory,item.thumbnailFile);if(fs.lstatSync(file).isSymbolicLink())return new Response('Not found',{status:404});}
      else file=store.mediaPath(match[1],match[2]==='/original');
      const response=await net.fetch(pathToFileURL(file).href);return new Response(response.body,{headers:{'Content-Type':'image/png','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
    }catch{return new Response('Not found',{status:404});}
  });
  window=new BrowserWindow({width:1200,height:760,minWidth:640,minHeight:360,show:false,frame:false,backgroundColor:'#18191d',alwaysOnTop:true,icon:appIcon(),
    webPreferences:{preload:path.join(__dirname,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,devTools:testMode}});
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  window.webContents.on('will-navigate',(event,url)=>{if(url!==entry)event.preventDefault();});
  window.webContents.on('will-attach-webview',event=>event.preventDefault());
  window.webContents.session.setPermissionRequestHandler((_contents,_permission,callback)=>callback(false));
  window.on('close',event=>{if(!closing){event.preventDefault();void hide();}});
  ipcMain.handle('clipboardline:state',event=>{trusted(event);return state();});
  ipcMain.handle('clipboardline:command',async(event,action,payload)=>{trusted(event);try{return await command(action,payload);}catch(error){notify(error.message);return state({error:error.message});}});
  await window.loadURL(entry);
  if(!testMode){
    const icon=appIcon();
    tray=new Tray(icon);tray.setToolTip('ClipBoardLine');tray.setContextMenu(Menu.buildFromTemplate([{label:'Open shelves',click:()=>show('shelves')},{label:'Library',click:()=>show('library')},{label:'Capture screen',click:()=>capture()},{label:'Settings',click:()=>show('settings')},{type:'separator'},{label:'Quit',click:()=>app.quit()}]));tray.on('click',()=>window.isVisible()?hide():show('shelves'));
    configureShortcuts();configureWatchers();
    monitor=native.monitor(()=>void readClipboard(),error=>{monitor?.kill();monitor=null;if(!closing)notify(error.message+' Falling back to bounded clipboard polling.');});
    clipboardTimer=setInterval(()=>{if(!monitor)void readClipboard();},1000);
    retentionTimer=setInterval(()=>{store.expire();broadcast();},3600000);
    updateTimer=setInterval(()=>{if(!development&&store.data.settings.autoCheckUpdates&&Date.now()-lastChecked>3600000){lastChecked=Date.now();void updates.check();}},60000);
    setTimeout(()=>{if(!development&&store.data.settings.autoCheckUpdates){lastChecked=Date.now();void updates.check();}},30000).unref();
  }
  await show('shelves');
  // Test hooks are main-process only and require an explicit isolated data path.
  if(testMode&&testFolder)global.__clipboardLineTest={store,command,state,readClipboard,writeClipboard,clipboardContent,privateClipboard,getWindow:()=>window,getTarget:()=>previous,setTarget:value=>{previous=value;},capture,native};
}).catch(error=>{dialog.showErrorBox('ClipBoardLine could not start',error.message);app.exit(1);});
app.on('second-instance',()=>{if(window)void show('shelves');});
app.on('activate',()=>{if(window)void show('shelves');});
app.on('before-quit',()=>{closing=true;clearInterval(clipboardTimer);clearInterval(retentionTimer);clearInterval(updateTimer);monitor?.kill();watchers.forEach(w=>w.close());globalShortcut.unregisterAll();});
