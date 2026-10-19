'use strict';
// Actual Windows/NSIS upgrade and reopen proof. This uses the corrected client
// with an isolated, temporary signed feed; it does not alter the public feed or
// claim that the already-released 1.7.0 client contains the corrected updater.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {execFileSync,spawn}=require('node:child_process');
const {_electron:electron}=require('playwright');
const {boundedFetch}=require('../lib/network.cjs');
const {windowsEnvironment}=require('../lib/windows-environment.cjs');
const pkg=require('../package.json');
if(process.platform!=='win32'||process.env.GITHUB_ACTIONS!=='true')throw new Error('Run upgrade acceptance only on the disposable Windows GitHub runner.');
const output=path.resolve(process.env.CLIPBOARDLINE_VALIDATION||'validation/upgrade');fs.mkdirSync(output,{recursive:true});
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'clipboardline-upgrade-'));
const installer=path.resolve('dist',`ClipBoardLine-Setup-${pkg.version}-x64.exe`),candidate=path.resolve('dist/win-unpacked/ClipBoardLine.exe');
const installedDirectory=path.join(temporary,'installed'),installed=path.join(installedDirectory,'ClipBoardLine.exe');
const previousVersion=pkg.version==='1.7.2'?'1.7.1':'1.7.0',previousBuild=pkg.version==='1.7.2'?63:62;
const previousURL=`https://github.com/orkunisitmak/clipboardline-desktop/releases/download/windows-${previousVersion}-build${previousBuild}/ClipBoardLine-Setup-${previousVersion}-x64.exe`;
const previousSHA=previousBuild===63?'f8e45afd1ce3ae4d5bbe1c6f355697cbe9f258e5297685a49d94cd05644631b1':'0f6f1aa59a406b5d7d2e2a64eb1dc1797fde4fc205e8781eb381645137923541';
const powershell=path.join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe');
const report={sourceRevision:process.env.GITHUB_SHA,platform:process.platform,arch:process.arch,version:pkg.version,build:pkg.clipboardLineBuild||63,previousVersion,previousBuild,scope:'real-old-install-and-data -> corrected-client isolated signed fixture -> actual candidate NSIS replacement and automatic reopen',oldClientCodeModified:false,publicFeedChanged:false,productionKeyChanged:false,checks:[],startedAt:new Date().toISOString()};
let application,installerObserver,observerOutput;
const check=(name,details={})=>{report.checks.push({name,passed:true,...details});console.log('PASS '+name);};
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
async function until(reader,predicate,timeout=120000){const end=Date.now()+timeout;let last;while(Date.now()<end){try{last=await reader();if(predicate(last))return last;}catch{}await new Promise(resolve=>setTimeout(resolve,300));}throw new Error('Timed out waiting for upgrade state: '+JSON.stringify(last));}
// Resolve Windows 8.3 aliases before the exact WMI path comparison. The
// temp directory can use RUNNER~1 while WMI reports the same file as runneradmin.
function processInfo(){const script="$payload=[Console]::In.ReadToEnd()|ConvertFrom-Json;$rows=@(Get-CimInstance Win32_Process|Where-Object {$_.ExecutablePath -eq $payload.path -and $_.CommandLine -notmatch '--type='}|ForEach-Object {$p=Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue;@{pid=$_.ProcessId;commandLine=$_.CommandLine;window=$p.MainWindowHandle.ToInt64();version=(Get-Item $_.ExecutablePath).VersionInfo.ProductVersion;path=$_.ExecutablePath}});ConvertTo-Json -InputObject $rows -Compress";const raw=execFileSync(powershell,['-NoProfile','-NonInteractive','-Command',script],{input:JSON.stringify({path:fs.realpathSync.native(installed)}),encoding:'utf8',timeout:15000,windowsHide:true,env:windowsEnvironment()});return JSON.parse(raw.replace(/^\uFEFF/,'').trim()||'[]');}
function installDiagnostics(){
  const script=String.raw`$payload=[Console]::In.ReadToEnd()|ConvertFrom-Json;$processes=@(Get-CimInstance Win32_Process|Where-Object {$_.ProcessId -ne $PID -and ($_.Name -like '*ClipBoardLine*' -or $_.CommandLine -like '*ClipBoardLine-Setup-*')}|ForEach-Object {@{pid=$_.ProcessId;parent=$_.ParentProcessId;name=$_.Name;path=$_.ExecutablePath;commandLine=$_.CommandLine}});$registry=@('HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*','HKCU:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*')|ForEach-Object {Get-ItemProperty $_ -ErrorAction SilentlyContinue}|Where-Object {$_.DisplayName -like 'ClipBoardLine*'}|ForEach-Object {@{name=$_.DisplayName;version=$_.DisplayVersion;location=$_.InstallLocation;uninstall=$_.UninstallString}};$exe=@{path=$payload.path;canonicalPath=$payload.canonicalPath;exists=(Test-Path -LiteralPath $payload.path)};if($exe.exists){$exe.version=(Get-Item -LiteralPath $payload.path).VersionInfo.ProductVersion};$shortcuts=@();try{$shell=New-Object -ComObject WScript.Shell;foreach($directory in @((Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'),(Join-Path $env:USERPROFILE 'Desktop'))){if(Test-Path $directory){Get-ChildItem -LiteralPath $directory -Filter 'ClipBoardLine.lnk' -Recurse -ErrorAction SilentlyContinue|ForEach-Object {$link=$shell.CreateShortcut($_.FullName);$shortcuts+=@{path=$_.FullName;target=$link.TargetPath;arguments=$link.Arguments}}}}}catch{};@{expectedExecutable=$exe;processes=$processes;registry=@($registry);shortcuts=$shortcuts;explorerProcesses=@(Get-Process -Name explorer -ErrorAction SilentlyContinue).Count}|ConvertTo-Json -Compress -Depth 5`;
  try{const raw=execFileSync(powershell,['-NoProfile','-NonInteractive','-Command',script],{input:JSON.stringify({path:installed,canonicalPath:fs.realpathSync.native(installed)}),encoding:'utf8',timeout:20000,windowsHide:true,env:windowsEnvironment()});return JSON.parse(raw.replace(/^\uFEFF/,'').trim());}catch(error){return{error:String(error.message).slice(0,500)};}
}
async function startInstallerObserver(sourceProcessId,userdata){
  observerOutput=path.join(temporary,'installer-process.json');const config=path.join(temporary,'installer-observer-config.json');
  fs.writeFileSync(config,JSON.stringify({sourceProcessId,installer:path.join(fs.realpathSync.native(userdata),'ci-upgrade-cache',`ClipBoardLine-Setup-${pkg.clipboardLineBuild||63}.exe`),output:observerOutput}));
  installerObserver=spawn(powershell,['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.resolve('tests/upgrade-observer.ps1'),'-Config',config],{windowsHide:true,stdio:'ignore',env:windowsEnvironment()});
  const ready=await until(()=>JSON.parse(fs.readFileSync(observerOutput,'utf8')),value=>['waiting','failed'].includes(value.status),15000);assert.equal(ready.status,'waiting',JSON.stringify(ready));
}
async function runInstaller(file,args){await new Promise((resolve,reject)=>{const child=spawn(file,args,{windowsHide:true,stdio:'ignore'});child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(new Error('Installer exited '+code)));});}
async function main(){
  assert.ok(fs.existsSync(installer)&&fs.existsSync(candidate),'Build the candidate installer and unpacked application first.');
  const previousBytes=(await boundedFetch(previousURL,{maximum:200*1024*1024,timeout:120000})).bytes;assert.equal(crypto.createHash('sha256').update(previousBytes).digest('hex'),previousSHA);
  const previous=path.join(temporary,'previous.exe');fs.writeFileSync(previous,previousBytes);check('previous public '+previousVersion+' installer matches its pinned release SHA256');
  await runInstaller(previous,['/S','/D='+installedDirectory]);assert.ok(fs.existsSync(installed));
  application=await electron.launch({executablePath:installed,args:[],timeout:60000});let page=await application.firstWindow();await page.waitForFunction(()=>!!window.clipboardLine);
  const before=await page.evaluate(()=>window.clipboardLine.state());assert.equal(before.version,previousVersion);assert.equal(before.build,previousBuild);
  const userdata=await application.evaluate(({app})=>app.getPath('userData'));check('actual previous installed '+previousVersion+' application launches with its existing per-user data location');
  const nonce=crypto.randomUUID();const noteText='Upgrade preservation '+nonce;
  const noteState=await page.evaluate(text=>window.clipboardLine.command('newNote',{text,title:'Upgrade note'}),noteText),noteId=noteState.result.id;
  await page.evaluate(id=>window.clipboardLine.command('tag',{ids:[id],tags:['upgrade-proof']}),noteId);
  const settings={captureText:true,captureImages:true,captureLinks:false,autoCheckUpdates:false,retentionDays:{image:15,text:7,link:3},language:'en'};
  await page.evaluate(patch=>window.clipboardLine.command('setSettings',{patch}),settings);
  const png=await page.evaluate(label=>{const c=document.createElement('canvas');c.width=160;c.height=100;const g=c.getContext('2d');g.fillStyle='orange';g.fillRect(0,0,160,100);g.fillStyle='black';g.fillText(label,8,40);return c.toDataURL('image/png');},nonce);
  await application.evaluate(async({clipboard,ClipboardItem,nativeImage},data)=>{await clipboard.write([new ClipboardItem({'image/png':new Blob([nativeImage.createFromDataURL(data).toPNG()],{type:'image/png'})})]);},png);
  const captured=await until(()=>page.evaluate(()=>window.clipboardLine.state()),state=>state.items.some(item=>item.kind==='image'&&item.createdAt>Date.now()-15000));
  const image=captured.items.find(item=>item.kind==='image'&&item.createdAt>Date.now()-15000);
  await page.evaluate(id=>window.clipboardLine.command('name',{id,name:'Upgrade image'}),image.id);
  await page.evaluate(id=>window.clipboardLine.command('tag',{ids:[id],tags:['upgrade-proof']}),image.id);
  await application.close();application=null;
  const libraryFile=path.join(userdata,'library.json');const oldLibrary=JSON.parse(fs.readFileSync(libraryFile));const oldImage=oldLibrary.items.find(item=>item.id===image.id),imageHash=hash(path.join(userdata,'media',oldImage.imageFile));
  check('real old application persists synthetic pinned text, original image, tags and per-kind/source/update settings');
  // The candidate updater runs in explicit isolated test mode against the same
  // disposable runner data. A fresh test key signs only this local fixture.
  const pair=crypto.generateKeyPairSync('ed25519'),publicKey=pair.publicKey.export({format:'der',type:'spki'}).subarray(-32).toString('base64');
  const candidateSHA=hash(installer),candidateSize=fs.statSync(installer).size;
  const manifest={schemaVersion:1,repository:'orkunisitmak/clipboardline-desktop',platform:'win32',arch:'x64',version:pkg.version,build:pkg.clipboardLineBuild||63,sourceRevision:process.env.GITHUB_SHA,url:`https://github.com/orkunisitmak/clipboardline-desktop/releases/download/windows-${pkg.version}-build${pkg.clipboardLineBuild||63}/${path.basename(installer)}`,size:candidateSize,sha256:candidateSHA};
  const payload=Buffer.from(JSON.stringify(manifest)),envelope={payload:payload.toString('base64'),signature:crypto.sign(null,payload,pair.privateKey).toString('base64')};
  const fixture=path.join(temporary,'signed-fixture.json');fs.writeFileSync(fixture,JSON.stringify(envelope));
  application=await electron.launch({executablePath:candidate,args:['--test-mode','--test-data='+userdata],timeout:60000});page=await application.firstWindow();await page.waitForFunction(()=>!!window.clipboardLine);
  await until(()=>application.evaluate(()=>!!global.__clipboardLineTest),Boolean);
  await application.evaluate(({app},{userdata,publicKey,fixture,installer,previousVersion,previousBuild})=>{
    const fs=process.getBuiltinModule('node:fs'),path=process.getBuiltinModule('node:path');
    const appRequire=process.getBuiltinModule('node:module').createRequire(path.join(app.getAppPath(),'package.json'));
    const {Updates,FEED}=appRequire('./lib/updates.cjs');
    const h=global.__clipboardLineTest;h.setUpdates(new Updates(path.join(userdata,'ci-upgrade-cache'),{build:previousBuild,version:previousVersion,publicKey,fetcher:async url=>({bytes:fs.readFileSync(url===FEED?fixture:installer)})}));
  },{userdata,publicKey,fixture,installer,previousVersion,previousBuild});
  const offer=await page.evaluate(()=>window.clipboardLine.command('checkUpdates'));assert.equal(offer.update.availableBuild,manifest.build);assert.equal(offer.update.availableVersion,pkg.version);assert.equal(offer.update.canInstall,true);
  report.fixture={actualClientVersion:pkg.version,actualClientBuild:pkg.clipboardLineBuild||63,simulatedInstalledVersion:previousVersion,simulatedInstalledBuild:previousBuild,testKeyInjectedOnlyIntoIsolatedMain:true,installerSHA256:candidateSHA,installerBytes:candidateSize};
  check('corrected candidate client verifies a dedicated local signed fixture and offers the exact candidate installer');
  report.beforeInstallation=installDiagnostics();await startInstallerObserver(await application.evaluate(()=>process.pid),userdata);
  const closed=application.waitForEvent('close',{timeout:60000});
  const request=page.evaluate(()=>window.clipboardLine.command('installUpdate')).then(result=>{if(result?.result?.error)throw new Error(result.result.error);return closed;}).catch(error=>{if(/closed|Target|destroyed/i.test(error.message))return closed;throw error;});
  await Promise.race([closed,request]);application=null;
  let reopened;try{reopened=await until(processInfo,rows=>rows.some(row=>row.commandLine?.includes('--updated')&&row.window&&String(row.version).startsWith(pkg.version)),180000);}finally{
    report.afterInstallation=installDiagnostics();try{report.installerProcess=JSON.parse(fs.readFileSync(observerOutput,'utf8'));}catch(error){report.installerProcess={error:String(error.message).slice(0,300)};}
    console.log('Upgrade installation diagnostics '+JSON.stringify({before:report.beforeInstallation,after:report.afterInstallation,installer:report.installerProcess}));
  }
  report.reopenedProcessIds=reopened.map(row=>row.pid);report.reopenedExecutable=fs.realpathSync.native(installed);report.reopenedProcesses=reopened;check('main installUpdate verifies/downloads and launches actual NSIS; force-run automatically reopens installed candidate with --updated');
  const current=await until(()=>JSON.parse(fs.readFileSync(libraryFile)),data=>data.items.some(item=>item.id===noteId));
  const keptNote=current.items.find(item=>item.id===noteId),keptImage=current.items.find(item=>item.id===image.id);
  assert.equal(keptNote.text,noteText);assert.equal(keptNote.name,'Upgrade note');assert.equal(keptNote.pinned,true);assert.ok(keptNote.tags.includes('upgrade-proof'));
  assert.equal(keptImage.name,'Upgrade image');assert.equal(keptImage.pinned,true);assert.ok(keptImage.tags.includes('upgrade-proof'));assert.equal(hash(path.join(userdata,'media',keptImage.imageFile)),imageHash);
  for(const key of ['captureText','captureImages','captureLinks','autoCheckUpdates','language'])assert.equal(current.settings[key],settings[key]);assert.deepEqual(current.settings.retentionDays,settings.retentionDays);
  check('actual old-install replacement retains text/image bytes, names, pins, tags, opt-out and per-kind retention after automatic reopen');
  const appVersion=execFileSync(powershell,['-NoProfile','-NonInteractive','-Command','(Get-Item ([Console]::In.ReadToEnd())).VersionInfo.ProductVersion'],{input:installed,encoding:'utf8',windowsHide:true,env:windowsEnvironment()}).trim();assert.ok(appVersion.startsWith(pkg.version));
  check('reopened executable is the actual new installed version in the prior installation directory');
  report.completedAt=new Date().toISOString();report.passed=true;
}
main().catch(error=>{report.passed=false;report.error=String(error.stack||error.message);console.error(report.error);process.exitCode=1;}).finally(async()=>{
  if(application)await application.close().catch(()=>{});
  if(installerObserver&&!installerObserver.killed)installerObserver.kill();
  // Stop only this fixture's installed process tree. Never target other paths.
  try{for(const row of processInfo())execFileSync('taskkill.exe',['/PID',String(row.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});}catch{}
  fs.writeFileSync(path.join(output,'windows-upgrade.json'),JSON.stringify(report,null,2));
  // Keep report and synthetic install evidence for runner artifact diagnostics.
});
