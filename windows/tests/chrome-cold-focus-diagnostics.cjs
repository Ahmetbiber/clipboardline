'use strict';
// A disposable-runner diagnostic, never a release acceptance substitute. Every
// case launches a fresh browser/profile and calls the unchanged product capture
// exactly once before any UIA/MSAA diagnostics. Only synthetic local HTML is used.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawn,execFileSync}=require('node:child_process');
const {chromium,_electron:electron}=require('playwright');
const {windowsEnvironment}=require('../lib/windows-environment.cjs');
if(process.platform!=='win32'||process.env.GITHUB_ACTIONS!=='true')throw new Error('Disposable native Windows runner required.');
const output=path.resolve('validation/chrome-cold-focus');fs.mkdirSync(output,{recursive:true});
const report={sourceRevision:process.env.GITHUB_SHA,diagnosticOnly:true,releaseAcceptance:false,scope:'Actual isolated Electron show/getTarget after a fresh Edge focus handoff; not complete package/NSIS acceptance.',productionFocusMonitor:true,extraFocusMonitor:false,runner:{imageVersion:process.env.ImageVersion,imageOS:process.env.ImageOS,osRelease:os.release(),osVersion:os.version()},startedAt:new Date().toISOString(),cases:[]};
const executable=[process.env['ProgramFiles(x86)'],process.env.ProgramFiles,process.env.LOCALAPPDATA].filter(Boolean).map(root=>path.join(root,'Google','Chrome','Application','chrome.exe')).find(file=>fs.existsSync(file));
if(!executable)throw new Error('Actual Google Chrome required.');
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'clipboardline-cold-focus-'));
const powershell=path.join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe');
// The failure occurred with .85 while the first diagnostic runner had .40.
// Upgrade only from Google's official, Authenticode-verified enterprise MSI;
// require the exact failing patch before starting any comparative capture.
// Never downgrade to or accept the older passing browser as a workaround.
const prepareBrowser=String.raw`$ErrorActionPreference='Stop';$config=[Console]::In.ReadToEnd()|ConvertFrom-Json;$before=(Get-Item -LiteralPath $config.executable).VersionInfo.ProductVersion;$receipt=@{before=$before;expected='155.0.8059.85';source='existing runner image'}
if([Version]$before -gt [Version]$receipt.expected){throw ('Refusing browser downgrade from '+$before)}
if($before -ne $receipt.expected){$url='https://dl.google.com/dl/chrome/install/googlechromestandaloneenterprise64.msi';Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $config.installer -TimeoutSec 120;$signature=Get-AuthenticodeSignature -LiteralPath $config.installer;if($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch '(?:^|, )O=Google LLC(?:,|$)'){throw 'Official Google installer signature verification failed.'};$receipt.source=$url;$receipt.installerSHA256=(Get-FileHash -LiteralPath $config.installer -Algorithm SHA256).Hash.ToLower();$receipt.installerBytes=(Get-Item -LiteralPath $config.installer).Length;$receipt.signer=$signature.SignerCertificate.Subject;$install=Start-Process -FilePath msiexec.exe -ArgumentList @('/i',('"'+$config.installer+'"'),'/qn','/norestart') -Wait -PassThru;$receipt.installerExitCode=$install.ExitCode;if($install.ExitCode -notin @(0,3010)){throw ('Official Google installer failed: '+$install.ExitCode)}}
$receipt.after=(Get-Item -LiteralPath $config.executable).VersionInfo.ProductVersion;$receipt|ConvertTo-Json -Compress|Set-Content -LiteralPath $config.receipt -Encoding UTF8;if($receipt.after -ne $receipt.expected){throw ('Exact failing Chrome patch required; installed '+$receipt.after)};$receipt|ConvertTo-Json -Compress`;
try{report.browserPreparation=JSON.parse(execFileSync(powershell,['-NoProfile','-MTA','-NonInteractive','-Command',prepareBrowser],{input:JSON.stringify({executable,installer:path.join(temporary,'google-chrome-official.msi'),receipt:path.join(output,'browser-provenance.json')}),encoding:'utf8',timeout:300000,windowsHide:true,env:windowsEnvironment()}).replace(/^\uFEFF/,'').trim());}catch(error){report.error='Exact failing Chrome patch preparation failed: '+String(error.stack||error);fs.writeFileSync(path.join(output,'observations.json'),JSON.stringify(report,null,2));throw error;}
console.log('Exact failing browser patch prepared '+JSON.stringify(report.browserPreparation));
const helperFile=path.join(temporary,'foreground.ps1');
// This observer is initialized before Chrome starts. It imports no UIA/MSAA
// types and reads only foreground HWND/owner/focus. The pointer case sends an
// ordinary OS click to the center of this owned synthetic editor, never a UIA
// focus request or accessibility preflight.
fs.writeFileSync(helperFile,String.raw`$ErrorActionPreference='Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class FocusWin32 {
 [StructLayout(LayoutKind.Sequential)] public struct GUITHREADINFO { public int size;public uint flags;public IntPtr active,focus,capture,menuOwner,moveSize,caret;public int left,top,right,bottom; }
 [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr window,out uint owner);
 [DllImport("user32.dll")] public static extern bool GetGUIThreadInfo(uint thread,ref GUITHREADINFO info);
 [DllImport("user32.dll")] public static extern bool SetCursorPos(int x,int y);
 [DllImport("user32.dll")] public static extern void mouse_event(uint flags,uint dx,uint dy,uint data,UIntPtr extra);
}
'@
[Console]::WriteLine('{"ready":true}')
while($null -ne ($line=[Console]::ReadLine())) {
 try {
  $request=$line|ConvertFrom-Json
  if($request.action -eq 'click') { [void][FocusWin32]::SetCursorPos([int]$request.x,[int]$request.y);[FocusWin32]::mouse_event(2,0,0,0,[UIntPtr]::Zero);[FocusWin32]::mouse_event(4,0,0,0,[UIntPtr]::Zero) }
  $window=[FocusWin32]::GetForegroundWindow();$owner=[uint32]0;$thread=[FocusWin32]::GetWindowThreadProcessId($window,[ref]$owner);$gui=New-Object FocusWin32+GUITHREADINFO;$gui.size=[Runtime.InteropServices.Marshal]::SizeOf($gui);[void][FocusWin32]::GetGUIThreadInfo($thread,[ref]$gui);$focusOwner=[uint32]0;[void][FocusWin32]::GetWindowThreadProcessId($gui.focus,[ref]$focusOwner)
  $process=[Diagnostics.Process]::GetProcessById($owner)
  [Console]::WriteLine((@{window=$window.ToInt64().ToString();owner=[int]$owner;focus=$gui.focus.ToInt64().ToString();focusOwner=[int]$focusOwner;executable=$process.MainModule.FileName}|ConvertTo-Json -Compress))
 } catch { [Console]::WriteLine((@{error=$_.Exception.Message}|ConvertTo-Json -Compress)) }
}`);
const observer=spawn(powershell,['-NoProfile','-MTA','-NonInteractive','-ExecutionPolicy','Bypass','-File',helperFile],{windowsHide:true,stdio:['pipe','pipe','pipe'],env:windowsEnvironment()});
let buffer='',stderr='',pending=[];
const observerReady=response();
observer.stdout.on('data',chunk=>{buffer+=chunk.toString();let newline;while((newline=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,newline).trim();buffer=buffer.slice(newline+1);if(!line)continue;let value;try{value=JSON.parse(line);}catch{throw new Error('Unexpected foreground observer output: '+line);}pending.shift()?.resolve(value);}});
observer.stderr.on('data',chunk=>{stderr+=chunk.toString();});
observer.on('exit',code=>{for(const entry of pending.splice(0))entry.reject(new Error('Foreground observer exited '+code+': '+stderr));});
function response(){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Foreground observer timeout: '+stderr)),15000);pending.push({resolve:value=>{clearTimeout(timer);resolve(value);},reject:error=>{clearTimeout(timer);reject(error);}});});}
async function win32(request={action:'snapshot'}){const next=response();observer.stdin.write(JSON.stringify(request)+'\n');const value=await next;if(value.error)throw new Error(value.error);return value;}
const html='<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; img-src data: blob:"><title>ClipBoardLine synthetic browser paste fixture</title><style>body{font:20px sans-serif;margin:30px}.rich{border:2px solid #777;min-height:50px;margin:12px 0;padding:12px}#editor{min-height:150px}input{display:block;margin-top:14px;padding:10px}</style><h1>Local consumer-browser paste fixture</h1><div id="editor" class="rich" contenteditable="true" role="textbox" aria-label="Synthetic rich editor"></div><div id="alternate" class="rich" contenteditable="true" role="textbox" aria-label="Synthetic alternate editor">Alternate untouched</div><input id="readonly" readonly value="Read-only untouched" aria-label="Synthetic read-only field"><input id="password" type="password" aria-label="Synthetic password field">';
let application;
async function appCapture(){
 const before=await application.evaluate(()=>global.__diagnosticCaptures.length);
 await application.evaluate(()=>global.__clipboardLineTest.command('show'));
 const result=await application.evaluate(start=>({captured:global.__clipboardLineTest.getTarget(),calls:global.__diagnosticCaptures.slice(start)}),before);
 if(result.calls.length!==1)throw new Error('One actual first native capture per show required: '+JSON.stringify(result));
 return result;
}
const hideApp=()=>application.evaluate(()=>global.__clipboardLineTest.command('hide'));
const sameExecutable=(first,second)=>fs.realpathSync.native(first).toLowerCase()===fs.realpathSync.native(second).toLowerCase();
async function observe(mode,repetition){
 const entry={mode,repetition,startedAt:new Date().toISOString()};report.cases.push(entry);
 // Reproduce the consumer-suite browser ordering. The same actual Electron app
 // captures a fresh Edge field, hides, then captures a fresh Chrome field.
 // This minimal prelude does not claim to replace the full Edge paste suite.
 const edgeExecutable=[process.env['ProgramFiles(x86)'],process.env.ProgramFiles,process.env.LOCALAPPDATA].filter(Boolean).map(root=>path.join(root,'Microsoft','Edge','Application','msedge.exe')).find(file=>fs.existsSync(file));
 if(!edgeExecutable)throw new Error('Actual Microsoft Edge required for the handoff.');
 await hideApp();
 const edge=await chromium.launch({executablePath:edgeExecutable,headless:false,args:['--force-renderer-accessibility','--no-first-run','--disable-background-networking','--disable-component-update','--disable-sync']});
 try{const target=await edge.newPage({viewport:{width:1100,height:700}});await target.goto('data:text/html,'+encodeURIComponent(html));await target.bringToFront();await target.locator('#editor').fill('Original browser fixture selection');await target.locator('#editor').press('Control+a');const foreground=await win32();const result=await appCapture();entry.edgePrelude={version:edge.version(),foreground,...result};if(!sameExecutable(foreground.executable,edgeExecutable)||!result.captured?.editable||result.captured.secure||result.captured.processId!==foreground.owner||result.captured.handle!==foreground.window)throw new Error('Edge prelude did not capture its actual native field: '+JSON.stringify(entry.edgePrelude));}finally{await hideApp();await edge.close();}
 const browser=await chromium.launch({executablePath:executable,headless:false,args:['--force-renderer-accessibility','--no-first-run','--disable-background-networking','--disable-component-update','--disable-sync']});
 try{
  // The first pair preserves the full suite's1100x700 viewport. The second
  // pair uses real metrics, required for CSS coordinates to map to OS input;
  // comparing the same native viewport with/without click isolates its effect.
  const nativeViewport=['dom-real-native-viewport','os-pointer-real-focus'].includes(mode);
  entry.version=browser.version();entry.viewport=nativeViewport?'native':'emulated1100x700';const target=await browser.newPage({viewport:nativeViewport?null:{width:1100,height:700}});const cdp=await target.context().newCDPSession(target);
  await cdp.send('Emulation.setFocusEmulationEnabled',{enabled:mode==='dom-emulated'});
  await target.goto('data:text/html,'+encodeURIComponent(html));await target.bringToFront();await target.locator('#editor').fill('Original synthetic selection');
  if(mode==='os-pointer-real-focus'){
   const point=await target.locator('#editor').evaluate(element=>{const r=element.getBoundingClientRect();return{x:Math.round(screenX+r.x+r.width/2),y:Math.round(screenY+outerHeight-innerHeight+r.y+r.height/2)};});
   entry.pointer={...point,foreground:await win32({action:'click',...point})};
   await target.waitForFunction(()=>document.activeElement?.id==='editor'&&document.hasFocus(),null,{timeout:3000});
   entry.pointer.domBeforeKeyboard=await target.evaluate(()=>({activeID:document.activeElement?.id,documentFocused:document.hasFocus()}));
  }
  await target.locator('#editor').press('Control+a');
  entry.before={dom:await target.evaluate(()=>({documentFocused:document.hasFocus(),activeID:document.activeElement?.id,isContentEditable:!!document.activeElement?.isContentEditable,visibility:document.visibilityState})),win32:await win32()};
  if(entry.version!=='155.0.8059.85')throw new Error('Exact Chrome patch changed: '+entry.version);
  const start=Date.now();Object.assign(entry,await appCapture());entry.captureWallMilliseconds=Date.now()-start;
  entry.afterWin32=await win32();entry.expectedChromeForeground=sameExecutable(entry.before.win32.executable,executable);entry.eligible=!!(entry.expectedChromeForeground&&entry.captured?.editable&&!entry.captured?.secure&&entry.captured.processId===entry.before.win32.owner&&entry.captured.handle===entry.before.win32.window);
  if(!entry.eligible){await hideApp();await target.bringToFront();entry.afterFailure=await application.evaluate(()=>global.__clipboardLineTest.native.captureDiagnostics());await target.screenshot({path:path.join(output,mode+'-'+repetition+'.png')});}
  console.log(JSON.stringify(entry));
 }finally{await hideApp();await browser.close();fs.writeFileSync(path.join(output,'observations.json'),JSON.stringify(report,null,2));}
}
(async()=>{
 await observerReady;
 application=await electron.launch({args:[path.resolve('.'),'--test-mode','--test-data='+path.join(temporary,'isolated-app')],timeout:60000});
 const appPage=await application.firstWindow();await appPage.waitForFunction(()=>!!window.clipboardLine);
 const readyDeadline=Date.now()+30000;while(!await application.evaluate(()=>!!global.__clipboardLineTest)){if(Date.now()>readyDeadline)throw new Error('Actual isolated Electron test hooks did not initialize.');await new Promise(resolve=>setTimeout(resolve,100));}
 // Observe only the product's actual capture call and return the same value.
 // No extra capture/diagnostic read or focus request runs before that call.
 await application.evaluate(()=>{const h=global.__clipboardLineTest,original=h.native.capture;global.__diagnosticCaptures=[];h.native.capture=async()=>{const started=Date.now();try{const value=await original();global.__diagnosticCaptures.push({value,elapsedMilliseconds:Date.now()-started});return value;}catch(error){global.__diagnosticCaptures.push({error:String(error.message),elapsedMilliseconds:Date.now()-started});throw error;}};});
 await hideApp();
 const modes=['dom-emulated','dom-real-focus','dom-real-native-viewport','os-pointer-real-focus'];
 for(let repetition=1;repetition<=2;repetition++)for(const mode of repetition===1?modes:[...modes].reverse())await observe(mode,repetition);
 report.completedAt=new Date().toISOString();report.completed=true;
})().catch(error=>{report.error=String(error.stack||error);console.error(report.error);}).finally(async()=>{await application?.close().catch(()=>{});observer.stdin.end();observer.kill();fs.writeFileSync(path.join(output,'observations.json'),JSON.stringify(report,null,2));console.log('Diagnostic observations only; deliberately stop the existing workflow before package/release acceptance.');process.exitCode=1;});
