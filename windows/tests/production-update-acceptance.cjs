'use strict';
// POST-PUBLICATION ONLY. Both installed binaries are anonymous public release
// assets. Never replace an Updates instance, feed/fetcher/key or installed
// version, and never enable test mode. This branch does not build the product.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {spawn,execFileSync}=require('node:child_process');
if(process.platform!=='win32'||process.arch!=='x64'||process.env.GITHUB_ACTIONS!=='true'||!process.env.RUNNER_TEMP)throw new Error('Use only a disposable x64 Windows GitHub runner.');
const {_electron:electron}=require('playwright');
const {boundedFetch}=require('../lib/network.cjs');
const {verifyEnvelope,FEED,PUBLIC_KEY}=require('../lib/updates.cjs');
const {windowsEnvironment}=require('../lib/windows-environment.cjs');
const {REPOSITORY,EXPECTED,expectedPublication,assertPublication,assertProductionRuntime}=require('./production-update-profile.cjs');
const expected=expectedPublication(process.env);
const output=path.resolve(process.env.CLIPBOARDLINE_VALIDATION||'validation/production-update');fs.mkdirSync(output,{recursive:true});
const temporary=fs.mkdtempSync(path.join(process.env.RUNNER_TEMP,'clipboardline-production-65-66-'));
const installedDirectory=path.join(temporary,'installed'),installed=path.join(installedDirectory,'ClipBoardLine.exe');
const powershell=path.join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe');
const report={schema:1,platform:process.platform,arch:process.arch,validationRevision:process.env.GITHUB_SHA,publishedSourceRevision:expected.source,expectedReleaseId:expected.releaseId,previous:{version:EXPECTED.previousVersion,build:EXPECTED.previousBuild,sourceRevision:EXPECTED.previousSource,installerSHA256:EXPECTED.previousSHA256},target:{version:EXPECTED.version,build:EXPECTED.build},scope:'unchanged published build65 -> real anonymous production feed/key and Settings buttons -> actual build66 NSIS replacement/automatic reopen -> normal production UI/native text and image paste',feed:FEED,publicKey:PUBLIC_KEY,testMode:false,updaterReplaced:false,fetcherOverridden:false,keyOverridden:false,versionOverridden:false,binaryModified:false,releaseModified:false,checks:[],rendererErrors:[],startedAt:new Date().toISOString()};
let application,observer,fixture,userdata,seed,manifest;
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const fileHash=file=>hash(fs.readFileSync(file));
const check=(name,details={})=>{report.checks.push({name,passed:true,...details});console.log('PASS '+name);};
async function until(reader,predicate,timeout=60000,label='owned validation state'){
 const deadline=Date.now()+timeout;while(Date.now()<deadline){try{const value=await reader();if(predicate(value))return value;}catch{}await new Promise(resolve=>setTimeout(resolve,250));}throw new Error('Timed out waiting for '+label);
}
function native(script,payload){return JSON.parse(execFileSync(powershell,['-NoProfile','-NonInteractive','-Command',script],{input:JSON.stringify(payload),encoding:'utf8',timeout:20000,windowsHide:true,env:windowsEnvironment()}).replace(/^\uFEFF/,'').trim()||'null');}
function processes(){
 if(!fs.existsSync(installed))return[];
 return native("$p=[Console]::In.ReadToEnd()|ConvertFrom-Json;$rows=@(Get-CimInstance Win32_Process|Where-Object {$_.ExecutablePath -eq $p.path -and $_.CommandLine -notmatch '--type='}|ForEach-Object {$x=Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue;@{pid=$_.ProcessId;commandLine=$_.CommandLine;window=$x.MainWindowHandle.ToInt64().ToString();version=(Get-Item -LiteralPath $_.ExecutablePath).VersionInfo.ProductVersion}});ConvertTo-Json -InputObject $rows -Compress",{path:fs.realpathSync.native(installed)});
}
function actualForeground(){return native("Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;public static class NativeForeground{[DllImport(\"user32.dll\")]public static extern IntPtr GetForegroundWindow();[DllImport(\"user32.dll\")]public static extern uint GetWindowThreadProcessId(IntPtr h,out uint p);}';$h=[NativeForeground]::GetForegroundWindow();[uint32]$owner=0;[void][NativeForeground]::GetWindowThreadProcessId($h,[ref]$owner);@{handle=$h.ToInt64().ToString();processId=$owner}|ConvertTo-Json -Compress",{});}
async function runtime(page,version,build){
 const info=await application.evaluate(({app,BrowserWindow})=>({packaged:app.isPackaged,testHooks:!!global.__clipboardLineTest,version:app.getVersion(),argv:process.argv,appPath:app.getAppPath(),userData:app.getPath('userData'),processId:process.pid,windowHandle:BrowserWindow.getAllWindows()[0].getNativeWindowHandle().readBigUInt64LE().toString()}));
 const state=await page.evaluate(()=>window.clipboardLine.state());assertProductionRuntime(info,version,build,state);return info;
}
async function launch(){
 application=await electron.launch({executablePath:installed,args:[],timeout:60000});
 const page=await application.firstWindow();await page.waitForFunction(()=>!!window.clipboardLine);
 page.on('pageerror',error=>report.rendererErrors.push({name:error.name,message:String(error.message).slice(0,500)}));return page;
}
async function stopOwned(){
 if(application){await application.close().catch(()=>{});application=null;}
 for(const row of processes())try{execFileSync('taskkill.exe',['/PID',String(row.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});}catch{}
 await until(processes,rows=>rows.length===0,20000,'only the owned installation to exit');
}
async function runInstaller(file,args){await new Promise((resolve,reject)=>{const child=spawn(file,args,{windowsHide:true,stdio:'ignore',env:windowsEnvironment()});const timer=setTimeout(()=>{child.kill();reject(new Error('Initial NSIS install exceeded its three-minute limit.'));},180000);child.once('error',error=>{clearTimeout(timer);reject(error);});child.once('exit',code=>{clearTimeout(timer);code===0?resolve():reject(new Error('NSIS installation exit '+code));});});}
async function command(page,action,payload={}){const result=await page.evaluate(({action,payload})=>window.clipboardLine.command(action,payload),{action,payload});assert.ok(!result.result?.error,action+' rejected: '+(result.result?.error||''));return result;}
async function settings(page){await command(page,'settings');await page.locator('[data-action="settings-tab"][data-tab="updates"]').click();await page.locator('[data-action="check-updates"]').waitFor({state:'visible'});}
async function publication(){
 const [feed,latestResponse]=await Promise.all([boundedFetch(FEED,{maximum:200000,timeout:60000}),boundedFetch(`https://api.github.com/repos/${REPOSITORY}/releases/latest`,{maximum:500000,timeout:60000})]);
 manifest=verifyEnvelope(feed.bytes);const latest=JSON.parse(latestResponse.bytes.toString('utf8'));
 assert.equal(String(latest.id),expected.releaseId,'Latest differs from the reviewed post-publication release ID.');
 const assetURL=latest.assets?.find(asset=>asset.name==='windows-update.json')?.browser_download_url;assert.ok(assetURL&&assetURL.startsWith(`https://github.com/${REPOSITORY}/releases/download/`));
 const asset=await boundedFetch(assetURL,{maximum:200000,timeout:60000});const identity=assertPublication(manifest,latest,asset.bytes,feed.bytes,expected);
 report.publication={...identity,feedSHA256:hash(feed.bytes),installerSHA256:manifest.sha256,installerBytes:manifest.size,url:manifest.url,sourceRevision:manifest.sourceRevision};
 check('anonymous canonical Latest and reviewed release ID expose the identical production-signed build66 feed with both platforms');return feed.bytes;
}
async function seedData(page){
 const state=await page.evaluate(()=>window.clipboardLine.state());assert.equal(state.items.length,0,'Disposable runner must have no existing clipboard history.');assert.equal(state.folders.length,0);
 const nonce=crypto.randomUUID(),text='Synthetic production upgrade note '+nonce;
 const settings={captureText:true,captureImages:true,captureLinks:false,fetchLinkMetadata:false,indexImages:false,openAfterScreenshot:false,autoCheckUpdates:false,sounds:false,theme:'neutral',cardSize:'small',language:'en',retentionDays:{image:15,text:7,link:3},localShortcuts:{remove:'Shift+Delete'}};
 await command(page,'setSettings',{patch:settings});
 const noteId=(await command(page,'newNote',{text,title:'Synthetic upgrade text'})).result.id;
 const folder=(await command(page,'createFolder',{name:'Synthetic upgrade folder'})).result;
 await command(page,'folder',{ids:[noteId],folderId:folder.id});await command(page,'tag',{ids:[noteId],tags:['synthetic-upgrade']});
 const beforeImages=new Set((await page.evaluate(()=>window.clipboardLine.state())).items.filter(item=>item.kind==='image').map(item=>item.id));
 const png=await page.evaluate(nonce=>{const canvas=document.createElement('canvas');canvas.width=160;canvas.height=100;const ctx=canvas.getContext('2d');ctx.fillStyle='#ef8e22';ctx.fillRect(0,0,160,100);ctx.fillStyle='#2055ce';ctx.fillRect(20,20,100,60);ctx.fillStyle='#ffffff';ctx.font='12px sans-serif';ctx.fillText(nonce.slice(0,8),28,55);return canvas.toDataURL('image/png');},nonce);
 await application.evaluate(async({clipboard,ClipboardItem,nativeImage},png)=>clipboard.write([new ClipboardItem({'image/png':new Blob([nativeImage.createFromDataURL(png).toPNG()],{type:'image/png'})})]),png);
 const captured=await until(()=>page.evaluate(()=>window.clipboardLine.state()),state=>state.items.some(item=>item.kind==='image'&&!beforeImages.has(item.id)),30000,'the shipped production clipboard monitor to collect its synthetic PNG');
 const image=captured.items.find(item=>item.kind==='image'&&!beforeImages.has(item.id));
 await command(page,'name',{id:image.id,name:'Synthetic upgrade image'});await command(page,'folder',{ids:[image.id],folderId:folder.id});await command(page,'tag',{ids:[image.id],tags:['synthetic-upgrade']});
 const data=JSON.parse(fs.readFileSync(path.join(userdata,'library.json'))),record=data.items.find(item=>item.id===image.id);
 return {noteId,imageId:image.id,text,textSHA256:hash(Buffer.from(text)),imageSHA256:fileHash(path.join(userdata,'media',record.imageFile)),settings,folder};
}
function preserved(){
 const data=JSON.parse(fs.readFileSync(path.join(userdata,'library.json'))),note=data.items.find(item=>item.id===seed.noteId),image=data.items.find(item=>item.id===seed.imageId);assert.ok(note&&image);
 assert.equal(hash(Buffer.from(note.text)),seed.textSHA256);assert.equal(note.name,'Synthetic upgrade text');assert.equal(image.name,'Synthetic upgrade image');
 for(const value of[note,image]){assert.equal(value.pinned,true);assert.ok(value.tags.includes('synthetic-upgrade'));assert.deepEqual(value.folderIds,[seed.folder.id]);assert.ok(!value.trashedAt);}
 assert.equal(data.folders.find(folder=>folder.id===seed.folder.id)?.name,seed.folder.name);assert.equal(fileHash(path.join(userdata,'media',image.imageFile)),seed.imageSHA256);
 for(const [key,value]of Object.entries(seed.settings))if(key==='localShortcuts')for(const [action,keyValue]of Object.entries(value))assert.equal(data.settings.localShortcuts[action],keyValue);else assert.deepEqual(data.settings[key],value);
 return {textId:note.id,imageId:image.id,folderId:seed.folder.id,textSHA256:seed.textSHA256,imageSHA256:seed.imageSHA256,organizationRetained:true,preferencesRetained:true};
}
async function observeInstaller(sourceProcessId,cache){
 const destination=path.join(temporary,'installer-observer.json'),configuration=path.join(temporary,'installer-observer-config.json');
 fs.writeFileSync(configuration,JSON.stringify({sourceProcessId,installer:path.join(fs.realpathSync.native(cache),'ClipBoardLine-Setup-66.exe'),output:destination,awaitInstallerMilliseconds:300000}));
 observer=spawn(powershell,['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.resolve('tests/upgrade-observer.ps1'),'-Config',configuration],{windowsHide:true,stdio:'ignore',env:windowsEnvironment()});
 await until(()=>JSON.parse(fs.readFileSync(destination,'utf8')),state=>state.status==='waiting',15000,'the exact-parent installer observer');return destination;
}
async function verifySettingsUI(page){
 await settings(page);assert.equal(await page.locator('[data-setting="autoCheckUpdates"]').isChecked(),false);await page.locator('[data-action="check-updates"]').click();
 const current=await until(()=>page.evaluate(()=>window.clipboardLine.state()),state=>state.update.status==='current'||state.update.status==='error',60000,'normal build66 production current check');assert.equal(current.update.status,'current');assert.equal(current.build,66);assert.ok(current.update.checkedAt);
 await page.screenshot({path:path.join(output,'build66-current.png')});
 await page.locator('[data-action="settings-tab"][data-tab="history"]').click();for(const [kind,days]of Object.entries(seed.settings.retentionDays))assert.equal(await page.locator(`[data-retention="${kind}"]`).inputValue(),String(days));
 await page.locator('[data-action="settings-tab"][data-tab="sources"]').click();for(const key of['captureText','captureImages','captureLinks','fetchLinkMetadata'])assert.equal(await page.locator(`[data-setting="${key}"]`).isChecked(),seed.settings[key]);
 check('normal build66 Settings UI retains update opt-out, source choices and separate retention, and the real Check button reports current');
}
async function nativePaste(page){
 const file=path.join(temporary,'synthetic-native-target.json');fixture=spawn(powershell,['-NoProfile','-STA','-ExecutionPolicy','Bypass','-File',path.resolve('tests/native-fixture.ps1'),'-Output',file],{windowsHide:false,stdio:'ignore',env:windowsEnvironment()});
 const read=()=>JSON.parse(fs.readFileSync(file,'utf8'));
 async function fixtureCommand(payload){const serial=crypto.randomUUID(),destination=file+'.commands';fs.writeFileSync(destination+'.tmp',JSON.stringify({...payload,serial}));for(let attempt=0;;attempt++){try{fs.renameSync(destination+'.tmp',destination);break;}catch(error){if(!['EPERM','EACCES','EBUSY'].includes(error.code)||attempt>=20)throw error;await new Promise(resolve=>setTimeout(resolve,25));}}const value=await until(read,state=>state.lastSerial===serial,15000,'synthetic editor command');assert.equal(value.commandError,'');return value;}
 await until(read,state=>state.ready,15000,'the separate native fixture');
 const proofs=[];
 for(const kind of['text','image']){
  await command(page,'hide');const target=kind==='text'?'plain':'rich';const initial=await fixtureCommand({action:'focus',target,seed:'SYNTHETIC_REPLACE_ME',selectAll:true});if(kind==='image')assert.equal(initial.hasImage,false);
  await command(page,'library');await page.locator('[data-action="scope"][data-scope="saved"]').click();
  const id=kind==='text'?seed.noteId:seed.imageId;await page.locator(`.library-grid [data-item-id="${id}"]`).click();
  if(kind==='image'){await page.keyboard.press('Space');await page.locator('#preview-dialog').waitFor({state:'visible'});}
  await page.keyboard.press('Control+Enter');await until(read,state=>kind==='text'?hash(Buffer.from(state.plainText))===seed.textSHA256:state.hasImage,15000,'actual upgraded '+kind+' paste');
  const suffix=kind==='text'?' TEXT_AFTER_UPGRADE':' IMAGE_AFTER_UPGRADE';await fixtureCommand({action:'keys',keys:suffix});
  const state=await until(read,state=>(kind==='text'?state.plainText:state.text).endsWith(suffix)&&state.focused===target&&state.foreground===state.handle,15000,'clickless '+kind+' typing focus');
  const product=await page.evaluate(()=>window.clipboardLine.state());assert.equal(product.windowVisible,false);assert.equal(await page.locator('#preview-dialog').count(),0);
  proofs.push({kind,view:kind==='image'?'Library image preview':'Library text',target,fixtureProcessId:state.processId,nativeForegroundMatches:true,clicklessTyping:true,hostHidden:true,previewClosed:true});
  check('actual normally launched upgraded build66 '+kind+' paste closes Library/preview and returns native typing focus');
 }
 report.nativePaste=proofs;
}
async function main(){
 const productionEnvelope=await publication();
 const previous=(await boundedFetch(EXPECTED.previousURL,{maximum:200*1024*1024,timeout:120000})).bytes;assert.equal(hash(previous),EXPECTED.previousSHA256);assert.equal(previous.subarray(0,2).toString(),'MZ');
 const previousFile=path.join(temporary,'published-build65.exe');fs.writeFileSync(previousFile,previous,{flag:'wx'});await runInstaller(previousFile,['/S','/D='+installedDirectory]);assert.ok(fs.existsSync(installed));
 let page=await launch();const before=await runtime(page,EXPECTED.previousVersion,EXPECTED.previousBuild);userdata=before.userData;assert.equal(path.basename(userdata).toLowerCase(),'clipboardline');assert.ok(path.isAbsolute(userdata));
 const unchanged={exe:fileHash(installed),asar:fileHash(before.appPath)};report.oldRuntime={processId:before.processId,version:EXPECTED.previousVersion,build:EXPECTED.previousBuild,packaged:true,testHooks:false,normalUserData:true,executableSHA256:unchanged.exe,asarSHA256:unchanged.asar};
 check('pinned published build65 installs and launches unchanged, packaged, without test mode or alternate data paths');
 seed=await seedData(page);report.before=preserved();check('ordinary production IPC and clipboard monitoring persist synthetic text/PNG, pins, folder, tag and custom source/retention/shortcut preferences');
 await settings(page);await page.locator('[data-action="check-updates"]').click();
 const offered=await until(()=>page.evaluate(()=>window.clipboardLine.state()),state=>['available','ready','error'].includes(state.update.status),60000,'the real old Settings Check button');assert.notEqual(offered.update.status,'error',offered.update.error);assert.equal(offered.version,EXPECTED.previousVersion);assert.equal(offered.build,EXPECTED.previousBuild);assert.equal(offered.update.availableVersion,EXPECTED.version);assert.equal(offered.update.availableBuild,EXPECTED.build);assert.equal(offered.update.canInstall,true);
 const cache=path.join(userdata,'updates');const cached=JSON.parse(fs.readFileSync(path.join(cache,'update-state.json')));assert.ok(Buffer.from(cached.envelope,'base64').equals(productionEnvelope));assert.equal(fileHash(installed),unchanged.exe);assert.equal(fileHash(before.appPath),unchanged.asar);
 await page.screenshot({path:path.join(output,'build65-production-offer.png')});check('actual old Settings Check offers build66 and its cached envelope exactly matches the public feed, with old executable/asar unchanged');
 const observerFile=await observeInstaller(before.processId,cache);const closed=application.waitForEvent('close',{timeout:360000});await page.locator('[data-action="install-update"]').click();await closed;application=null;
 const packageFile=path.join(cache,'ClipBoardLine-Setup-66.exe');assert.equal(fs.statSync(packageFile).size,manifest.size);assert.equal(fileHash(packageFile),manifest.sha256);check('old production Install button downloads the complete published build66 package and passes exact signed size/hash gates');
 const installer=await until(()=>JSON.parse(fs.readFileSync(observerFile,'utf8')),state=>['exited','failed','still-running'].includes(state.status),220000,'the observed actual installer to exit');report.installer=installer;assert.equal(installer.status,'exited');assert.equal(installer.exitCode,0);assert.match(installer.commandLine,/--updated/);assert.match(installer.commandLine,/--force-run/);
 const rows=await until(processes,rows=>rows.some(row=>row.window!=='0'&&String(row.version).startsWith(EXPECTED.version)&&row.commandLine.includes('--updated')),120000,'automatic build66 reopening from NSIS');const reopened=rows.find(row=>row.window!=='0'&&String(row.version).startsWith(EXPECTED.version)&&row.commandLine.includes('--updated'));assert.notEqual(reopened.pid,before.processId);assert.ok(!/--test-(mode|data)/.test(reopened.commandLine));
 const foreground=await until(actualForeground,value=>value.processId===reopened.pid&&value.handle===reopened.window,30000,'the automatically reopened production window foreground');report.automaticReopen={processId:reopened.pid,version:reopened.version,window:reopened.window,updatedFlag:true,testMode:false,nativeForeground:true,observedBeforeManualRelaunch:true};report.afterAutomaticReopen=preserved();check('actual NSIS replaces the old installation, automatically reopens build66 with --updated and native foreground, retaining all synthetic data');
 // The NSIS-launched process has no automation endpoint. Observe that launch
 // natively first, then close only this owned path and relaunch the same new
 // installation normally for UI/paste inspection. Never retrofit test hooks.
 await stopOwned();page=await launch();const current=await runtime(page,EXPECTED.version,EXPECTED.build);assert.equal(path.resolve(current.userData),path.resolve(userdata));report.afterNormalRelaunch=preserved();
 await verifySettingsUI(page);await nativePaste(page);assert.deepEqual(report.rendererErrors,[]);report.passed=true;report.completedAt=new Date().toISOString();
}
main().catch(error=>{report.passed=false;report.error=String(error.stack||error.message).replaceAll(seed?.text||'__NO_SYNTHETIC_TEXT__','[synthetic text]').slice(0,8000);console.error(report.error);process.exitCode=1;}).finally(async()=>{
 try{await stopOwned();}catch{}if(observer&&!observer.killed)observer.kill();if(fixture&&!fixture.killed)fixture.kill();
 fs.writeFileSync(path.join(output,'windows-production-65-to-66.json'),JSON.stringify(report,null,2)+'\n');
});
