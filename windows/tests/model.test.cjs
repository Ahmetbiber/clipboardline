'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const {Store,plainURL}=require('../lib/model.cjs');
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64');
function fixture(fn){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'clipboardline-model-'));let now=1000;try{const store=new Store(dir,{clock:()=>now});return fn(store,value=>{now=value;},dir);}finally{fs.rmSync(dir,{recursive:true,force:true});}}
test('exact recopy moves a text to front and preserves saved organization',()=>fixture((s,time)=>{const first=s.insert('text','API key exact value');s.modify('name',{id:first.id,name:'Service key'});const folder=s.modify('createFolder',{name:'Work'});s.modify('folder',{ids:[first.id],folderId:folder.id});s.modify('tag',{ids:[first.id],tags:['api']});time(2000);s.insert('text','something else');time(3000);const latest=s.insert('text','API key exact value');assert.equal(s.data.items.length,2);assert.equal(latest.id,first.id);assert.equal(latest.name,'Service key');assert.deepEqual(latest.folderIds,[folder.id]);assert.deepEqual(latest.tags,['api']);assert.equal(latest.createdAt,3000);assert.equal(s.data.items[0].id,first.id);}));
test('dedup is byte exact and preserves whitespace/case',()=>fixture(s=>{for(const value of ['foo','foo ','Foo','foo\n'])s.insert('text',value);assert.equal(s.data.items.length,4);}));
test('URLs must be a sole public-protocol URL, normal prose stays text',()=>{assert.equal(plainURL('hello https://example.com'),null);assert.equal(plainURL('javascript:alert(1)'),null);assert.equal(plainURL('https://secret@example.com'),null);assert.equal(plainURL('https://example.com'), 'https://example.com/');});
test('retention is per-kind; pinned/folder/tag records remain permanent',()=>fixture((s,time)=>{const text=s.insert('text','expiring text'),link=s.insert('link','https://example.com'),saved=s.insert('text','tagged');s.modify('tag',{ids:[saved.id],tags:['keep']});s.modify('setSettings',{patch:{retentionDays:{text:1,link:3,image:0}}});time(2*86400000);s.expire();assert.ok(text.trashedAt);assert.equal(link.trashedAt,null);assert.equal(saved.trashedAt,null);}));
test('remove hides saved items, trashes temporary ones; undo preserves later edits',()=>fixture(s=>{const saved=s.insert('text','saved'),temp=s.insert('text','temporary');s.modify('pin',{ids:[saved.id]});s.modify('remove',{ids:[saved.id,temp.id]});assert.equal(saved.hiddenFromShelf,true);assert.ok(temp.trashedAt);s.modify('name',{id:saved.id,name:'Later name'});s.modify('undo');assert.equal(saved.hiddenFromShelf,false);assert.equal(temp.trashedAt,null);assert.equal(saved.name,'Later name');}));
test('explicit Trash invalidates removal undo and deletion requires Trash',()=>fixture(s=>{const item=s.insert('text','text');assert.throws(()=>s.modify('delete',{ids:[item.id]}));s.modify('remove',{ids:[item.id]});s.modify('restore',{ids:[item.id]});assert.equal(s.undoStack.length,0);s.modify('trash',{ids:[item.id]});s.modify('delete',{ids:[item.id]});assert.equal(s.data.items.length,0);}));
test('batch operations are atomic when one content kind is invalid',()=>fixture(s=>{const text=s.insert('text','before'),image=s.insert('image',png);assert.throws(()=>s.modify('editText',{ids:[text.id,image.id],text:'after'}));assert.equal(s.item(text.id).text,'before');}));
test('safe JSON persistence reloads content and stores rollback copy',()=>fixture((s,_time,dir)=>{const item=s.insert('text','private locally saved');s.modify('pin',{ids:[item.id]});assert.equal(new Store(dir).item(item.id).pinned,true);assert.ok(fs.existsSync(path.join(dir,'library.json.backup')));if(process.platform!=='win32')assert.equal(fs.statSync(path.join(dir,'library.json')).mode&0o777,0o600);else{const powershell=path.join(process.env.SystemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe');const raw=require('node:child_process').execFileSync(powershell,['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(__dirname,'..','native','protect-directory.ps1'),'-Directory',dir,'-Check'],{windowsHide:true,encoding:'utf8',env:require('../lib/windows-environment.cjs').windowsEnvironment()});const acl=JSON.parse(raw);assert.equal(acl.protected,true);assert.ok(acl.principals.includes(acl.currentUser));assert.deepEqual([...new Set(acl.principals)].sort(),[acl.currentUser,'S-1-5-18','S-1-5-32-544'].sort());}}));
test('corrupt library is preserved rather than replaced',()=>fixture((s,_time,dir)=>{s.insert('text','important');fs.writeFileSync(s.file,'broken JSON');assert.throws(()=>new Store(dir),/Original data was preserved/);assert.equal(fs.readFileSync(s.file,'utf8'),'broken JSON');}));
test('managed PNG storage is hashed, immutable, private and protocol-only in public state',()=>fixture(s=>{const item=s.insert('image',png);assert.equal(fs.readFileSync(s.mediaPath(item.id)).toString('hex'),png.toString('hex'));const before=item.imageFile;s.modify('saveImage',{id:item.id,dataUrl:'data:image/png;base64,'+png.toString('base64'),crop:{x:0,y:0,width:1,height:1},annotations:[{type:'marker',x:0,y:0}]});assert.equal(item.imageFile,before);const state=s.publicState().items[0];assert.equal(state.imageFile,undefined);assert.match(state.mediaUrl,/^appmedia:\/\/media\/[a-f0-9-]+$/);assert.throws(()=>s.mediaPath('../library.json'));}));
test('oversize or invalid image and path traversal data are rejected',()=>fixture(s=>{assert.throws(()=>s.insert('image',Buffer.from('not png')));const item=s.insert('image',png);item.imageFile='../../library.json';assert.throws(()=>s.mediaPath(item.id));}));
test('folder rename/removal retains items and reparents nested folders',()=>fixture(s=>{const parent=s.modify('createFolder',{name:'Parent'}),child=s.modify('createFolder',{name:'Child',parentId:parent.id});const item=s.insert('text','kept');s.modify('folder',{ids:[item.id],folderId:parent.id});s.modify('renameFolder',{id:parent.id,name:'New'});assert.equal(parent.name,'New');s.modify('removeFolder',{id:parent.id});assert.equal(child.parentId,null);assert.equal(item.pinned,true);assert.deepEqual(item.folderIds,[]);}));
test('settings merge nested retention and shortcut maps, rejecting prototype and filesystem injection',()=>fixture(s=>{s.modify('setSettings',{patch:{retentionDays:{text:7},localShortcuts:{pin:'O'}}});assert.equal(s.data.settings.retentionDays.image,30);assert.equal(s.data.settings.localShortcuts.pin,'O');assert.throws(()=>s.modify('setSettings',{patch:JSON.parse('{"localShortcuts":{"__proto__":"oops"}}')}));assert.throws(()=>s.modify('setSettings',{patch:{watchFolders:['../private']}}));}));

test('permanent deletion purges orphan managed rasters and refreshes both JSON snapshots',()=>fixture((s,_time,dir)=>{
  const item=s.insert('image',png),original=item.imageFile;
  const edited=Buffer.from(png);edited[edited.length-1]^=1;
  s.modify('saveImage',{id:item.id,dataUrl:'data:image/png;base64,'+edited.toString('base64')});const derivative=item.renderedFile;
  const superseded=Buffer.from(png);superseded[superseded.length-2]^=1;const orphan=s.putPNG(superseded);
  const external=path.join(dir,'original-image.png'),unmanaged=path.join(s.mediaDirectory,'original-image.png');fs.writeFileSync(external,png);fs.writeFileSync(unmanaged,png);
  const secret=s.insert('text','synthetic deleted private note');s.modify('trash',{ids:[item.id,secret.id]});s.modify('delete',{ids:[item.id,secret.id]});
  for(const filename of [original,derivative,orphan])assert.equal(fs.existsSync(path.join(s.mediaDirectory,filename)),false);
  assert.ok(fs.existsSync(external));assert.ok(fs.existsSync(unmanaged));
  for(const file of [s.file,s.file+'.backup']){const snapshot=JSON.parse(fs.readFileSync(file,'utf8'));assert.equal(snapshot.items.length,0);assert.ok(!fs.readFileSync(file,'utf8').includes(secret.text));}
  assert.equal(s.publicState().needsDeletionCleanup,false);
}));
test('permanent deletion keeps rasters referenced by live items or recoverable Trash',()=>fixture(s=>{
  const first=s.insert('image',png),file=path.join(s.mediaDirectory,first.imageFile);s.modify('trash',{ids:[first.id]});
  const second=s.insert('image',png);s.modify('delete',{ids:[first.id]});assert.ok(fs.existsSync(file));
  s.modify('trash',{ids:[second.id]});const third=s.insert('image',png);s.modify('trash',{ids:[third.id]});
  s.modify('delete',{ids:[second.id]});assert.ok(fs.existsSync(file));s.modify('restore',{ids:[third.id]});assert.deepEqual(fs.readFileSync(s.mediaPath(third.id)),png);
}));
test('ordinary removal and retention preserve managed images for undo and Trash recovery',()=>fixture((s,time)=>{
  const item=s.insert('image',png),file=s.mediaPath(item.id);s.modify('remove',{ids:[item.id]});assert.ok(fs.existsSync(file));s.modify('undo');assert.equal(item.trashedAt,null);
  time(32*86400000);s.expire();assert.ok(item.trashedAt);assert.ok(fs.existsSync(file));s.modify('restore',{ids:[item.id]});assert.ok(fs.existsSync(s.mediaPath(item.id)));
}));
test('a failed deletion commit preserves records and managed images',()=>fixture(s=>{
  const item=s.insert('image',png),file=s.mediaPath(item.id);s.modify('trash',{ids:[item.id]});const rename=fs.renameSync;
  try{fs.renameSync=(source,destination)=>{if(destination===s.file)throw Object.assign(new Error('synthetic unavailable volume'),{code:'EIO'});return rename(source,destination);};assert.throws(()=>s.modify('delete',{ids:[item.id]}),/synthetic unavailable volume/);}finally{fs.renameSync=rename;}
  assert.ok(s.item(item.id).trashedAt);assert.ok(fs.existsSync(file));assert.ok(JSON.parse(fs.readFileSync(s.file,'utf8')).items.some(record=>record.id===item.id));assert.equal(s.publicState().needsDeletionCleanup,false);
}));
test('backup cleanup failure is explicit and recoverable after the deletion commits',()=>fixture(s=>{
  const item=s.insert('image',png),file=s.mediaPath(item.id);s.modify('trash',{ids:[item.id]});const rename=fs.renameSync;
  try{fs.renameSync=(source,destination)=>{if(destination===s.file+'.backup'&&source.includes('.backup.tmp-'))throw Object.assign(new Error('synthetic backup denial'),{code:'EACCES'});return rename(source,destination);};assert.throws(()=>s.modify('delete',{ids:[item.id]}),error=>error.committed&&/incomplete/.test(error.message));}finally{fs.renameSync=rename;}
  assert.equal(s.data.items.length,0);assert.ok(fs.existsSync(file));assert.equal(s.publicState().needsDeletionCleanup,true);assert.match(s.privacyWarning,/Retry cleanup/);
  assert.equal(JSON.parse(fs.readFileSync(s.file,'utf8')).pendingBackupRefresh,true);
  s.modify('cleanup');assert.equal(s.publicState().needsDeletionCleanup,false);assert.equal(s.privacyWarning,'');assert.equal(fs.existsSync(file),false);assert.equal(JSON.parse(fs.readFileSync(s.file+'.backup','utf8')).items.length,0);
}));
test('image unlink failure remains pending and retries safely on next startup',()=>fixture((s,_time,dir)=>{
  const item=s.insert('image',png),file=s.mediaPath(item.id);s.modify('trash',{ids:[item.id]});const unlink=fs.unlinkSync;
  try{fs.unlinkSync=destination=>{if(destination===file)throw Object.assign(new Error('synthetic file in use'),{code:'EACCES'});return unlink(destination);};assert.throws(()=>s.modify('delete',{ids:[item.id]}),error=>error.committed&&/incomplete/.test(error.message));}finally{fs.unlinkSync=unlink;}
  assert.equal(s.data.items.length,0);assert.equal(s.publicState().needsDeletionCleanup,true);assert.ok(fs.existsSync(file));assert.equal(JSON.parse(fs.readFileSync(s.file+'.backup','utf8')).items.length,0);
  const reloaded=new Store(dir);assert.equal(reloaded.data.items.length,0);assert.equal(reloaded.publicState().needsDeletionCleanup,false);assert.equal(fs.existsSync(file),false);
}));
test('final cleanup-state write failure cannot resurrect records or removed rasters',()=>fixture(s=>{
  const item=s.insert('image',png),file=s.mediaPath(item.id);s.modify('trash',{ids:[item.id]});const rename=fs.renameSync;let commits=0;
  try{fs.renameSync=(source,destination)=>{if(destination===s.file&&++commits===2)throw Object.assign(new Error('synthetic final commit failure'),{code:'EIO'});return rename(source,destination);};assert.throws(()=>s.modify('delete',{ids:[item.id]}),error=>error.committed&&/incomplete/.test(error.message));}finally{fs.renameSync=rename;}
  assert.equal(s.data.items.length,0);assert.equal(fs.existsSync(file),false);assert.equal(s.publicState().needsDeletionCleanup,true);assert.equal(JSON.parse(fs.readFileSync(s.file,'utf8')).items.length,0);
  s.modify('cleanup');assert.equal(s.publicState().needsDeletionCleanup,false);assert.equal(JSON.parse(fs.readFileSync(s.file+'.backup','utf8')).items.length,0);
}));
