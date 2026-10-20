'use strict';
const fs=require('node:fs'),path=require('node:path');
const {spawn}=require('node:child_process');
const {windowsEnvironment}=require('./windows-environment.cjs');
const MAXIMUM_VIDEO_BYTES=2*1024*1024*1024,MAXIMUM_JOB_MS=10*60*1000;
const SCRIPT=__dirname.includes('app.asar')?path.join(process.resourcesPath,'native','windows-media.ps1'):path.join(__dirname,'..','native','windows-media.ps1');
const OWNER='clipboardline-media-v1',MARKER='.clipboardline-media.json';
function regular(file){const stat=fs.lstatSync(file);return stat.isFile()&&!stat.isSymbolicLink();}
function safeDirectory(directory){const stat=fs.lstatSync(directory);if(!stat.isDirectory()||stat.isSymbolicLink())throw new Error('Unsafe private video directory.');}
function validVideo(file){if(typeof file!=='string'||!path.isAbsolute(file)||!['.mov','.mp4'].includes(path.extname(file).toLowerCase())||!regular(file))throw new Error('Recording is unavailable.');const stat=fs.statSync(file);if(stat.size<12||stat.size>MAXIMUM_VIDEO_BYTES)throw new Error('Recording exceeds the 2 GB import limit.');return stat;}
function metadata(value){if(!value||!Number.isFinite(value.durationMs)||value.durationMs<=0||value.durationMs>24*60*60*1000||!Number.isInteger(value.width)||!Number.isInteger(value.height)||value.width<1||value.height<1||value.width*value.height>80_000_000)throw new Error('Invalid recording metadata.');return{durationMs:value.durationMs,width:value.width,height:value.height,videoCodec:String(value.videoCodec||'').slice(0,80),audioTracks:Number.isInteger(value.audioTracks)?value.audioTracks:0};}
function aborted(){const error=new Error('Video operation canceled.');error.name='AbortError';return error;}
class MediaJobs {
 constructor({directory,script=SCRIPT,timeout=MAXIMUM_JOB_MS}={}){
  if(typeof directory!=='string'||!path.isAbsolute(directory))throw new Error('Invalid private video directory.');safeDirectory(path.dirname(directory));this.directory=directory;fs.mkdirSync(this.directory,{recursive:true,mode:0o700});safeDirectory(this.directory);this.script=script;this.timeout=Math.min(MAXIMUM_JOB_MS,Math.max(1,timeout));this.jobs=new Map();
  for(const name of fs.readdirSync(this.directory))if(/^job-[A-Za-z0-9]{6}$/.test(name))this.remove(path.join(this.directory,name));
 }
 remove(directory){
  try{if(path.dirname(directory)!==this.directory||!/^job-[A-Za-z0-9]{6}$/.test(path.basename(directory)))return false;safeDirectory(directory);const marker=path.join(directory,MARKER);if(!regular(marker)||fs.statSync(marker).size>1000)return false;const value=JSON.parse(fs.readFileSync(marker,'utf8'));if(value.owner!==OWNER)return false;const names=fs.readdirSync(directory);if(names.some(name=>![MARKER,'poster.png','trimmed.mp4','audio.wav'].includes(name)||!regular(path.join(directory,name))))return false;for(const name of names)fs.unlinkSync(path.join(directory,name));fs.rmdirSync(directory);return true;}catch{return false;}
 }
 async run(mode,source,{startMs,endMs,signal,verifyAudio=false}={}){
  if(process.platform!=='win32')throw new Error('Native recording processing requires Windows.');
  if(signal?.aborted)throw aborted();const before=validVideo(source);safeDirectory(this.directory);
  if(mode==='Trim'&&(!Number.isFinite(startMs)||!Number.isFinite(endMs)||startMs<0||endMs-startMs<50))throw new Error('Choose a nonempty trim interval.');
  const directory=fs.mkdtempSync(path.join(this.directory,'job-'));fs.writeFileSync(path.join(directory,MARKER),JSON.stringify({owner:OWNER}),{flag:'wx',mode:0o600});
  let keep=false;
  try{
   const result=await new Promise((resolve,reject)=>{
    const executable=path.join(process.env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
    const child=spawn(executable,['-NoLogo','-NoProfile','-MTA','-NonInteractive','-ExecutionPolicy','Bypass','-File',this.script,'-Mode',mode],{windowsHide:true,stdio:['pipe','pipe','pipe'],env:windowsEnvironment()});
    let stdout='',stderr='',failure=null,finished=false;this.jobs.set(directory,child);
    const stop=error=>{failure??=error;child.kill();};const cancel=()=>stop(aborted());
    child.on('spawn',()=>{if(failure)child.kill();});
    signal?.addEventListener('abort',cancel,{once:true});if(signal?.aborted)cancel();
    const timer=setTimeout(()=>stop(new Error('Video operation timed out after ten minutes.')),this.timeout);
    child.stdout.on('data',chunk=>{stdout+=chunk.toString('utf8');if(stdout.length>64000)stop(new Error('Invalid video helper response.'));});
    child.stderr.on('data',chunk=>{stderr+=chunk.toString('utf8');if(stderr.length>64000)stop(new Error('Video helper failed.'));});
    const done=(error,code)=>{if(finished)return;finished=true;clearTimeout(timer);signal?.removeEventListener('abort',cancel);this.jobs.delete(directory);if(failure||error)return reject(failure||new Error('Windows video helper could not start.'));let value;try{value=JSON.parse(stdout.trim());}catch{return reject(new Error('Windows video helper did not respond.'));}if(code!==0||value.ok!==true){const problem=new Error(typeof value.error==='string'?value.error.slice(0,500):'Windows could not process this recording.');problem.code='MEDIA_UNSUPPORTED_OR_FAILED';if(typeof value.stage==='string'&&/^[A-Za-z]{1,30}$/.test(value.stage))problem.stage=value.stage;if(Number.isInteger(value.hresult))problem.hresult=value.hresult;return reject(problem);}resolve(value);};
    child.on('error',error=>done(error));child.on('close',code=>done(null,code));child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify({source,outputDirectory:directory,verifyAudio:verifyAudio===true,...(mode==='Trim'?{startMs,endMs}:{})}));
   });
   if(signal?.aborted)throw aborted();const after=validVideo(source);if(before.size!==after.size||before.mtimeMs!==after.mtimeMs||before.ino!==after.ino)throw new Error('The recording changed while processing.');
   const details=metadata(result),poster=path.join(directory,'poster.png');if(result.posterFile!=='poster.png'||!regular(poster)||fs.statSync(poster).size>4*1024*1024)throw new Error('Video poster is unavailable.');const posterPNG=await fs.promises.readFile(poster);if(posterPNG.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw new Error('Invalid video poster.');
   let audioFile;if(result.audioFile!==undefined){audioFile=path.join(directory,'audio.wav');if(result.audioFile!=='audio.wav'||!regular(audioFile)||fs.statSync(audioFile).size>32*1024*1024)throw new Error('Invalid native audio verification.');}
   if(mode==='Trim'){const file=path.join(directory,'trimmed.mp4');if(result.trimmedFile!=='trimmed.mp4')throw new Error('Invalid recording output.');validVideo(file);keep=true;return{...details,file,posterFile:poster,jobDirectory:directory,...(audioFile?{audioFile}:{})};}
   keep=true;return{...details,file:source,posterFile:poster,jobDirectory:directory,...(audioFile?{audioFile}:{})};
  }finally{if(!keep)this.remove(directory);}
 }
 probe(file,options){return this.run('Inspect',file,options);}
 inspect(file,options){return this.probe(file,options);}
 trim(file,options){return this.run('Trim',file,options);}
 release(result){return !!result&&this.remove(result.jobDirectory);}
 dispose(){for(const child of this.jobs.values())child.kill();for(const name of fs.readdirSync(this.directory))if(/^job-[A-Za-z0-9]{6}$/.test(name)&&!this.jobs.has(path.join(this.directory,name)))this.remove(path.join(this.directory,name));}
}
module.exports={MediaJobs,MAXIMUM_VIDEO_BYTES,MAXIMUM_JOB_MS,metadata,validVideo};
