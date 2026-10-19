'use strict';
// Native acceptance of the actual already-published binaries. No release,
// production feed, pinned key, fetcher or shipped binary is modified.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {execFileSync,spawn}=require('node:child_process');
const {_electron:electron}=require('playwright');
const {boundedFetch}=require('../lib/network.cjs');
const {verifyEnvelope,FEED,PUBLIC_KEY}=require('../lib/updates.cjs');
const {windowsEnvironment}=require('../lib/windows-environment.cjs');
if(process.platform!=='win32'||process.env.GITHUB_ACTIONS!=='true')throw new Error('Use the disposable native Windows GitHub runner.');
const output=path.resolve('validation/public-update');fs.mkdirSync(output,{recursive:true});
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'clipboardline-public-update-'));
const installedDirectory=path.join(temporary,'installed'),installed=path.join(installedDirectory,'ClipBoardLine.exe');
const ps=path.join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe');
const report={platform:process.platform,arch:process.arch,sourceRevision:process.env.GITHUB_SHA,startedAt:new Date().toISOString(),scope:'actual published Windows binaries, merged anonymous Latest, real Settings update buttons, real NSIS installation',feed:FEED,publicKey:PUBLIC_KEY,releaseMutated:false,keyMutated:false,binaryMutated:false,checks:[],rendererErrors:[],scenarios:[]};
let application,observer,userdata,seed;
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const check=(name,details={})=>{report.checks.push({name,passed:true,...details});console.log('PASS '+name);};
async function until(reader,predicate,timeout=60000){const end=Date.now()+timeout;let last;while(Date.now()<end){try{last=await reader();if(predicate(last))return last;}catch{}await new Promise(resolve=>setTimeout(resolve,300));}throw new Error('Timed out: '+JSON.stringify(last));}
function native(script,payload){return JSON.parse(execFileSync(ps,['-NoProfile','-NonInteractive','-Command',script],{input:JSON.stringify(payload),encoding:'utf8',timeout:20000,windowsHide:true,env:windowsEnvironment()}).replace(/^\uFEFF/,'').trim()||'null');}
function processes(){if(!fs.existsSync(installed))return[];return native("$p=[Console]::In.ReadToEnd()|ConvertFrom-Json;$rows=@(Get-CimInstance Win32_Process|Where-Object {$_.ExecutablePath -eq $p.path -and $_.CommandLine -notmatch '--type='}|ForEach-Object {$x=Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue;@{pid=$_.ProcessId;path=$_.ExecutablePath;commandLine=$_.CommandLine;window=$x.MainWindowHandle.ToInt64();version=(Get-Item $_.ExecutablePath).VersionInfo.ProductVersion}});ConvertTo-Json -InputObject $rows -Compress",{path:fs.realpathSync.native(installed)});}
function version(){return native("$p=[Console]::In.ReadToEnd()|ConvertFrom-Json;ConvertTo-Json -InputObject ((Get-Item -LiteralPath $p.path).VersionInfo.ProductVersion)",{path:installed});}
async function launch(args=[]){application=await electron.launch({executablePath:installed,args,timeout:60000});const page=await application.firstWindow();await page.waitForFunction(()=>!!window.clipboardLine);page.on('pageerror',error=>report.rendererErrors.push(String(error.stack||error.message).slice(0,2000)));return page;}
async function stopOwned(){if(application){await application.close().catch(()=>{});application=null;}for(const row of processes()){try{execFileSync('taskkill.exe',['/PID',String(row.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});}catch{}}await until(()=>processes(),rows=>rows.length===0,20000);}
async function runInstaller(file,args){await new Promise((resolve,reject)=>{const child=spawn(file,args,{windowsHide:true,stdio:'ignore'});child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(new Error('NSIS exit '+code)));});}
async function settings(page){await until(()=>page.evaluate(()=>window.clipboardLine.command('settings')),state=>state.view==='settings',15000);await page.locator('[data-action="settings-tab"][data-tab="updates"]').click();await page.locator('[data-action="check-updates"]').waitFor({state:'visible'});}
async function observe(pid,cache,label){const destination=path.join(temporary,label+'-observer.json'),config=path.join(temporary,label+'-config.json');fs.writeFileSync(config,JSON.stringify({sourceProcessId:pid,installer:path.join(fs.realpathSync.native(cache),`ClipBoardLine-Setup-${report.manifest.build}.exe`),output:destination}));observer=spawn(ps,['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.resolve('tests/upgrade-observer.ps1'),'-Config',config],{windowsHide:true,stdio:'ignore',env:windowsEnvironment()});await until(()=>JSON.parse(fs.readFileSync(destination,'utf8')),state=>state.status==='waiting',15000);return destination;}
async function seedData(page){
 const nonce=crypto.randomUUID(),text='Published update preservation '+nonce;
 const note=await page.evaluate(text=>window.clipboardLine.command('newNote',{text,title:'Public update note'}),text),noteId=note.result.id;
 const folder=(await page.evaluate(()=>window.clipboardLine.command('createFolder',{name:'Public update folder'}))).result;
 await page.evaluate(({noteId,folderId})=>window.clipboardLine.command('folder',{ids:[noteId],folderId}),{noteId,folderId:folder.id});
 await page.evaluate(id=>window.clipboardLine.command('tag',{ids:[id],tags:['public-update-proof']}),noteId);
 const settings={captureText:true,captureImages:true,captureLinks:false,autoCheckUpdates:false,retentionDays:{image:15,text:7,link:3},language:'en'};
 await page.evaluate(patch=>window.clipboardLine.command('setSettings',{patch}),settings);
 const png=await page.evaluate(label=>{const c=document.createElement('canvas');c.width=160;c.height=100;const g=c.getContext('2d');g.fillStyle='orange';g.fillRect(0,0,160,100);g.fillStyle='black';g.fillText(label,8,40);return c.toDataURL('image/png');},nonce);
 await application.evaluate(async({clipboard,ClipboardItem,nativeImage},data)=>{await clipboard.write([new ClipboardItem({'image/png':new Blob([nativeImage.createFromDataURL(data).toPNG()],{type:'image/png'})})]);},png);
 const captured=await until(()=>page.evaluate(()=>window.clipboardLine.state()),state=>state.items.some(item=>item.kind==='image'&&item.createdAt>Date.now()-20000));
 const image=captured.items.find(item=>item.kind==='image'&&item.createdAt>Date.now()-20000);
 await page.evaluate(id=>window.clipboardLine.command('name',{id,name:'Public update image'}),image.id);
 await page.evaluate(({id,folderId})=>window.clipboardLine.command('folder',{ids:[id],folderId}),{id:image.id,folderId:folder.id});
 await page.evaluate(id=>window.clipboardLine.command('tag',{ids:[id],tags:['public-update-proof']}),image.id);
 const data=JSON.parse(fs.readFileSync(path.join(userdata,'library.json'))),record=data.items.find(item=>item.id===image.id);
 return{noteId,text,imageId:image.id,imageSHA256:hash(fs.readFileSync(path.join(userdata,'media',record.imageFile))),settings,folder};
}
function preserved(){const data=JSON.parse(fs.readFileSync(path.join(userdata,'library.json'))),note=data.items.find(item=>item.id===seed.noteId),image=data.items.find(item=>item.id===seed.imageId);assert.equal(note.text,seed.text);assert.equal(note.name,'Public update note');assert.equal(image.name,'Public update image');for(const item of[note,image]){assert.equal(item.pinned,true);assert.ok(item.tags.includes('public-update-proof'));assert.ok(item.folderIds.includes(seed.folder.id));}assert.equal(data.folders.find(folder=>folder.id===seed.folder.id).name,seed.folder.name);assert.equal(hash(fs.readFileSync(path.join(userdata,'media',image.imageFile))),seed.imageSHA256);for(const key of['captureText','captureImages','captureLinks','autoCheckUpdates','language'])assert.equal(data.settings[key],seed.settings[key]);assert.deepEqual(data.settings.retentionDays,seed.settings.retentionDays);return{noteId:note.id,imageId:image.id,folderId:seed.folder.id,imageSHA256:seed.imageSHA256,preferencesRetained:true};}
async function updateFromUI(page,label,{requireAutomatic=false}={}){
 await settings(page);await page.locator('[data-action="check-updates"]').click();
 const offered=await until(()=>page.evaluate(()=>window.clipboardLine.state()),state=>state.update.status==='available'||state.update.status==='ready'||state.update.status==='error');
 assert.notEqual(offered.update.status,'error',JSON.stringify(offered.update));assert.equal(offered.update.availableBuild||report.manifest.build,report.manifest.build);assert.equal(offered.update.availableVersion||offered.update.version,report.manifest.version);
 await page.locator('[data-action="install-update"]').waitFor({state:'visible'});await page.screenshot({path:path.join(output,label+'-available.png')});
 const scenario={label,actualVersion:offered.version,actualBuild:offered.build,offeredVersion:report.manifest.version,offeredBuild:report.manifest.build,realButtons:true,feedFetcherOverridden:false,publicKeyOverridden:false};report.scenarios.push(scenario);
 check(label+': actual Settings Check button offers the production-signed latest version');
 const cache=path.join(userdata,'updates');fs.mkdirSync(cache,{recursive:true});const observed=await observe(await application.evaluate(()=>process.pid),cache,label);
 const closed=application.waitForEvent('close',{timeout:180000});await page.locator('[data-action="install-update"]').click();await closed;application=null;
 const file=path.join(cache,`ClipBoardLine-Setup-${report.manifest.build}.exe`);assert.equal(hash(fs.readFileSync(file)),report.manifest.sha256);assert.equal(fs.statSync(file).size,report.manifest.size);check(label+': real Install button downloaded and verified the entire anonymous public package');
 await until(version,value=>String(value).startsWith(report.manifest.version),180000);
 const installerState=await until(()=>JSON.parse(fs.readFileSync(observed,'utf8')),state=>['exited','failed'].includes(state.status),200000);scenario.installer=installerState;assert.notEqual(installerState.status,'failed',JSON.stringify(installerState));
 const reopened=await until(processes,rows=>rows.some(row=>row.window&&String(row.version).startsWith(report.manifest.version)),requireAutomatic?120000:15000).catch(()=>[]);
 scenario.automaticReopen=!!reopened.length;scenario.reopened=reopened;scenario.preserved=preserved();
 if(requireAutomatic){assert.ok(scenario.automaticReopen,'Corrected production updater must reopen automatically.');assert.ok(reopened.some(row=>row.commandLine.includes('--updated')),'Automatic reopening must carry the installer updated flag.');assert.match(installerState.commandLine,/--updated/);assert.match(installerState.commandLine,/--force-run/);}
 check(label+': actual NSIS replaces the original installation with current production version and retains text/image/folders/tags/settings',{automaticReopen:scenario.automaticReopen});
 if(observer&&!observer.killed)observer.kill();observer=null;
 await stopOwned();
 return scenario;
}
async function main(){
 const feed=(await boundedFetch(FEED,{maximum:200000,timeout:60000})).bytes;report.manifest=verifyEnvelope(feed);report.feedSHA256=hash(feed);assert.equal(report.manifest.version,'1.7.1');assert.equal(report.manifest.build,63);assert.equal(report.manifest.sha256,'f8e45afd1ce3ae4d5bbe1c6f355697cbe9f258e5297685a49d94cd05644631b1');
 check('merged canonical Latest serves the unchanged production-signed Windows1.7.1/build63 manifest anonymously');
 const previousURL='https://github.com/orkunisitmak/clipboardline-desktop/releases/download/windows-1.7.0-build62/ClipBoardLine-Setup-1.7.0-x64.exe';
 const previous=(await boundedFetch(previousURL,{maximum:200*1024*1024,timeout:120000})).bytes;assert.equal(hash(previous),'0f6f1aa59a406b5d7d2e2a64eb1dc1797fde4fc205e8781eb381645137923541');
 const previousFile=path.join(temporary,'previous.exe');fs.writeFileSync(previousFile,previous);await runInstaller(previousFile,['/S','/D='+installedDirectory]);let page=await launch();userdata=await application.evaluate(({app})=>app.getPath('userData'));assert.equal((await page.evaluate(()=>window.clipboardLine.state())).build,62);check('actual unmodified published1.7.0/build62 is installed and running');
 seed=await seedData(page);check('old shipped app stores synthetic named pinned text/image, folder/tag and update/source/retention settings');
 const legacy=await updateFromUI(page,'shipped-62-to-63');report.legacyFirstTransitionNeedsManualOpen=!legacy.automaticReopen;
 page=await launch();const current=await page.evaluate(()=>window.clipboardLine.state());assert.equal(current.version,'1.7.1');assert.equal(current.build,63);preserved();await settings(page);await page.locator('[data-action="check-updates"]').click();await until(()=>page.evaluate(()=>window.clipboardLine.state()),state=>state.update.status==='current');await page.screenshot({path:path.join(output,'shipped-63-current.png')});check('reopened actual production build63 displays current through real Settings check and preserved library');
 await stopOwned();
 // The current binary cannot naturally discover itself as a newer version.
 // Isolate ONLY the installed-version comparison; retain its real production
 // key, fetcher, feed, signed envelope, package, installer and launch behavior.
 page=await launch(['--test-mode','--test-data='+userdata]);await until(()=>application.evaluate(()=>!!global.__clipboardLineTest),Boolean);const before=await application.evaluate(()=>{const h=global.__clipboardLineTest,u=h.getUpdates();const value={build:u.build,version:u.version,publicKey:u.publicKey,hasFetcher:typeof u.fetcher==='function'};u.build=62;u.version='1.7.0';return value;});assert.equal(before.build,63);assert.equal(before.publicKey,PUBLIC_KEY);report.correctedScenarioComparisonOverride={actualVersion:'1.7.1',actualBuild:63,comparisonVersion:'1.7.0',comparisonBuild:62,onlyComparisonOverridden:true};
 await updateFromUI(page,'shipped-63-production-reinstall',{requireAutomatic:true});
 page=await launch();assert.equal((await page.evaluate(()=>window.clipboardLine.state())).build,63);preserved();await settings(page);await page.locator('[data-action="check-updates"]').click();await until(()=>page.evaluate(()=>window.clipboardLine.state()),state=>state.update.status==='current');await page.screenshot({path:path.join(output,'final-current.png')});check('final normal production launch retains library and verifies current without test mode');
 assert.deepEqual(report.rendererErrors,[]);report.passed=true;report.seamlessCurrentClient=true;report.completedAt=new Date().toISOString();
}
main().catch(error=>{report.passed=false;report.error=String(error.stack||error.message);console.error(report.error);process.exitCode=1;}).finally(async()=>{try{await stopOwned();}catch{}if(observer&&!observer.killed)observer.kill();fs.writeFileSync(path.join(output,'windows-public-update.json'),JSON.stringify(report,null,2));});
