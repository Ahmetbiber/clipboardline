'use strict';
// A disposable-runner diagnostic, never a release acceptance substitute. Every
// case launches a fresh browser/profile and calls the unchanged product capture
// exactly once before any UIA/MSAA diagnostics. Only synthetic local HTML is used.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawn}=require('node:child_process');
const {chromium}=require('playwright');
const native=require('../lib/native.cjs');
const {windowsEnvironment}=require('../lib/windows-environment.cjs');
if(process.platform!=='win32'||process.env.GITHUB_ACTIONS!=='true')throw new Error('Disposable native Windows runner required.');
const output=path.resolve('validation/chrome-cold-focus');fs.mkdirSync(output,{recursive:true});
const report={sourceRevision:process.env.GITHUB_SHA,diagnosticOnly:true,releaseAcceptance:false,scope:'Comparative native focus preconditions, not complete Electron/NSIS acceptance.',productionFocusMonitor:true,startedAt:new Date().toISOString(),cases:[]};
const executable=[process.env['ProgramFiles(x86)'],process.env.ProgramFiles,process.env.LOCALAPPDATA].filter(Boolean).map(root=>path.join(root,'Google','Chrome','Application','chrome.exe')).find(file=>fs.existsSync(file));
if(!executable)throw new Error('Actual Google Chrome required.');
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'clipboardline-cold-focus-'));
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
const powershell=path.join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe');
const observer=spawn(powershell,['-NoProfile','-MTA','-NonInteractive','-ExecutionPolicy','Bypass','-File',helperFile],{windowsHide:true,stdio:['pipe','pipe','pipe'],env:windowsEnvironment()});
let buffer='',stderr='',pending=[];
const observerReady=response();
observer.stdout.on('data',chunk=>{buffer+=chunk.toString();let newline;while((newline=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,newline).trim();buffer=buffer.slice(newline+1);if(!line)continue;let value;try{value=JSON.parse(line);}catch{throw new Error('Unexpected foreground observer output: '+line);}pending.shift()?.resolve(value);}});
observer.stderr.on('data',chunk=>{stderr+=chunk.toString();});
observer.on('exit',code=>{for(const entry of pending.splice(0))entry.reject(new Error('Foreground observer exited '+code+': '+stderr));});
function response(){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Foreground observer timeout: '+stderr)),15000);pending.push({resolve:value=>{clearTimeout(timer);resolve(value);},reject:error=>{clearTimeout(timer);reject(error);}});});}
async function win32(request={action:'snapshot'}){const next=response();observer.stdin.write(JSON.stringify(request)+'\n');const value=await next;if(value.error)throw new Error(value.error);return value;}
const html='<!doctype html><meta charset="utf-8"><title>ClipBoardLine synthetic cold focus diagnostic</title><style>body{font:20px sans-serif;margin:30px}#editor{border:2px solid #777;min-height:180px;margin-top:20px;padding:12px}</style><h1>Synthetic local editor</h1><div id="editor" contenteditable="true" role="textbox" aria-label="Synthetic rich editor"></div>';
let monitor;
async function observe(mode,repetition){
 const entry={mode,repetition,startedAt:new Date().toISOString()};report.cases.push(entry);
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
  const start=Date.now();entry.captured=await native.capture().catch(error=>({error:error.message}));entry.captureWallMilliseconds=Date.now()-start;
  entry.afterWin32=await win32();entry.expectedChromeForeground=fs.realpathSync.native(entry.before.win32.executable).toLowerCase()===fs.realpathSync.native(executable).toLowerCase();entry.eligible=!!(entry.expectedChromeForeground&&entry.captured?.editable&&!entry.captured?.secure&&entry.captured.processId===entry.before.win32.owner&&entry.captured.handle===entry.before.win32.window);
  if(!entry.eligible){entry.afterFailure=await native.captureDiagnostics();await target.screenshot({path:path.join(output,mode+'-'+repetition+'.png')});}
  console.log(JSON.stringify(entry));
 }finally{await browser.close();fs.writeFileSync(path.join(output,'observations.json'),JSON.stringify(report,null,2));}
}
(async()=>{
 await observerReady;
 // Match the application's existing 250ms native focus monitor. Start it before
 // any target browser exists; do not wait for or query the target's AX readiness.
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Production focus monitor did not initialize.')),30000);const ready=()=>{clearTimeout(timer);resolve();};monitor=native.monitor(ready,reject,ready);});
 const modes=['dom-emulated','dom-real-focus','dom-real-native-viewport','os-pointer-real-focus'];
 for(let repetition=1;repetition<=2;repetition++)for(const mode of repetition===1?modes:[...modes].reverse())await observe(mode,repetition);
 report.completedAt=new Date().toISOString();report.completed=true;
})().catch(error=>{report.error=String(error.stack||error);console.error(report.error);}).finally(()=>{monitor?.kill();observer.stdin.end();observer.kill();fs.writeFileSync(path.join(output,'observations.json'),JSON.stringify(report,null,2));console.log('Diagnostic observations only; deliberately stop the existing workflow before package/release acceptance.');process.exitCode=1;});
