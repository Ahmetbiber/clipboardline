'use strict';
// Runs the actual renderer handlers with a small DOM/IPC fixture. These cases
// validate UI state transitions, not browser layout or native Windows paste.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

function fixture(){
 const listeners=new Map(),nodes=new Map(),commands=[],imageLoads=[];let exportFailures=0;
 class Element{
  constructor(id=''){this.id=id;this.innerHTML='';this.textContent='';this.dataset={};this.style={};this.className='';this.value='';this.selectionStart=0;this.selectionEnd=0;this.classList={add(){},remove(){},contains(){return false;}};}
  setAttribute(){}querySelector(){return null;}querySelectorAll(){return [];}focus(){}blur(){}select(){}setSelectionRange(){}scrollIntoView(){}matches(){return false;}closest(){return null;}
 }
 class TextArea extends Element{}
 class Canvas extends Element{
  constructor(id=''){super(id);this.width=900;this.height=220;}
  getBoundingClientRect(){return{left:0,top:0,width:900,height:220};}
  getContext(){return new Proxy({}, {get(object,key){return object[key]??(()=>{});},set(object,key,value){object[key]=value;return true;}});}
  toDataURL(){if(exportFailures){exportFailures--;throw Object.assign(new Error('Synthetic canvas export rejection'),{name:'SecurityError'});}return 'data:image/png;base64,iVBORw0KGgo=';}
 }
 class FixtureImage extends Element{
  constructor(){super();this.naturalWidth=900;this.naturalHeight=220;this.complete=true;}
  set src(value){imageLoads.push({url:value,crossOrigin:this.crossOrigin});if(this.onload)queueMicrotask(()=>this.onload());}
 }
 const document={body:new Element('body'),activeElement:null,getElementById(id){if(!nodes.has(id))nodes.set(id,id==='markup-canvas'?new Canvas(id):new Element(id));return nodes.get(id);},createElement(tag){return tag==='canvas'?new Canvas():new Element();},querySelector(){return null;},addEventListener(name,listener){if(!listeners.has(name))listeners.set(name,[]);listeners.get(name).push(listener);}};
 const image='00000000-0000-4000-8000-000000000001',text1='00000000-0000-4000-8000-000000000002',text2='00000000-0000-4000-8000-000000000003',link='00000000-0000-4000-8000-000000000004';
 const base=(id,kind,createdAt,extra)=>({id,kind,createdAt,updatedAt:createdAt,name:'',title:'',text:'',url:'',pinned:false,folderIds:[],tags:[],trashedAt:null,hiddenFromShelf:false,...extra});
 const state={items:[base(image,'image',1000,{name:'Synthetic image',mediaUrl:'appmedia://media/'+image,originalMediaUrl:'appmedia://media/'+image+'/original'}),base(text1,'text',900,{text:'Text one'}),base(text2,'text',800,{text:'Text two'}),base(link,'link',700,{url:'https://example.com/reference',title:'Reference link'})],folders:[],settings:{visibleKinds:['image','text','link'],retentionDays:{image:30,text:30,link:30},shortcuts:{toggle:'Control+Alt+Space',search:'Control+Alt+S'},localShortcuts:{},language:'en',theme:'soft',cardSize:'medium'},view:'shelves',version:'1.7.0',windowVisible:true,canUndo:false};
 let subscriber,removed=[],cleanupFailures=0,editFailures=0;
 const clone=value=>structuredClone(value);
 const api={emit(patch){Object.assign(state,patch);subscriber?.(clone(state));},state:async()=>clone(state),subscribe(fn){subscriber=fn;return()=>{};},async command(action,payload={}){commands.push({action,payload:clone(payload)});const selected=state.items.filter(item=>(payload.ids||[payload.id]).includes(item.id));
  let cleanupError;if(action==='cleanup'){if(cleanupFailures){cleanupFailures--;cleanupError='Permanent deletion cleanup is still pending.';}else state.needsDeletionCleanup=false;}
  if(action==='editText'){if(editFailures){editFailures--;cleanupError='Synthetic draft write failure';}else selected.forEach(item=>item.text=payload.text);}
  if(action==='saveImage')selected.forEach(item=>{item.crop=clone(payload.crop);item.annotations=clone(payload.annotations);});
  if(action==='pin')selected.forEach(item=>item.pinned=typeof payload.value==='boolean'?payload.value:!item.pinned);
  if(action==='name')selected.forEach(item=>{item.name=payload.name;item.pinned=true;});
  if(action==='remove'){removed=selected.map(clone);selected.forEach(item=>{if(item.pinned)item.hiddenFromShelf=true;else item.trashedAt=Date.now();});state.canUndo=true;}
  if(action==='undo'){for(const before of removed)Object.assign(state.items.find(item=>item.id===before.id),before);state.canUndo=false;}
  if(action==='copy'&&!payload.keepOpen||action==='paste'||action==='hide')state.windowVisible=false;
  if(action==='show'){state.view='shelves';state.windowVisible=true;state.viewEvent={serial:String(commands.length)};}
  if(action==='library'||action==='settings'){state.view=action;state.windowVisible=true;}
  const output=clone(state);if(cleanupError)output.result={error:cleanupError};subscriber?.(output);return output;
 }};
 const context={window:{clipboardLine:api,addEventListener(){}},document,HTMLElement:Element,HTMLTextAreaElement:TextArea,Image:FixtureImage,console,structuredClone,URL,Set,Date,JSON,Math,Number,String,requestAnimationFrame:fn=>fn(),setTimeout:fn=>{queueMicrotask(fn);return 1;},clearTimeout(){}};
 vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(__dirname,'../renderer.js'),'utf8'),context,{filename:'renderer.js'});
 async function ready(){await new Promise(setImmediate);}
 async function key(code,{ctrl=false,alt=false,shift=false,key}={}){const event={code,key:key||(/^Key/.test(code)?code.slice(3).toLowerCase():code==='Space'?' ':code),ctrlKey:ctrl,metaKey:false,altKey:alt,shiftKey:shift,repeat:false,target:new Element(),preventDefault(){this.prevented=true;}};for(const listener of listeners.get('keydown')||[])await listener(event);await ready();return event;}
 async function click(action,extra={}){const target=new Element();target.dataset.action=action;Object.assign(target.dataset,extra);target.closest=selector=>selector==='[data-action]'?target:null;for(const listener of listeners.get('click')||[])listener({target,stopPropagation(){}});await ready();}
 async function pointer(type,x,y){const target=document.getElementById('markup-canvas');for(const listener of listeners.get(type)||[])listener({target,clientX:x,clientY:y,pointerId:1,shiftKey:false,preventDefault(){}});await ready();}
 async function input(id,value){const target=document.getElementById(id);target.value=value;target.selectionStart=value.length;for(const listener of listeners.get('input')||[])await listener({target});await ready();}
 return{ready,key,input,click,pointer,imageLoads,failExportOnce(){exportFailures++;},failCleanupOnce(){cleanupFailures++;},failEditOnce(){editFailures++;},state,commands,nodes,image,text1,text2,link,api,get main(){return nodes.get('app').innerHTML;},get overlay(){return nodes.get('overlay-root').innerHTML;}};
}

test('fresh shelves select the first item; P pins it; Space previews it',async()=>{const f=fixture();await f.ready();assert.match(f.main,/card kind-image focused selected/);await f.key('KeyP');assert.equal(f.state.items[0].pinned,true);await f.key('Space');assert.match(f.overlay,/id="preview-dialog"/);assert.match(f.overlay,/aria-label="Synthetic image"/);});

test('preview arrows move across shelf kinds, S keeps preview on neighbor, Backspace restores',async()=>{const f=fixture();await f.ready();await f.key('Space');await f.key('ArrowDown');assert.match(f.overlay,/aria-label="Text one"/);await f.key('KeyS');assert.match(f.overlay,/aria-label="Text two"/);assert.ok(f.state.items.find(item=>item.id===f.text1).trashedAt);await f.key('Backspace');assert.match(f.overlay,/aria-label="Text one"/);assert.equal(f.state.items.find(item=>item.id===f.text1).trashedAt,null);});

test('preview CtrlC keeps open; Enter copies exact current item and dismisses',async()=>{const f=fixture();await f.ready();await f.key('Space');await f.key('ArrowDown');await f.key('KeyC',{ctrl:true});assert.equal(f.commands.at(-1).action,'copy');assert.equal(f.commands.at(-1).payload.keepOpen,true);assert.match(f.overlay,/id="preview-dialog"/);await f.key('Enter');assert.equal(f.commands.at(-1).payload.ids[0],f.text1);assert.equal(f.commands.at(-1).payload.keepOpen,false);assert.equal(f.state.windowVisible,false);assert.equal(f.overlay,'');});

test('L opens Library; CtrlK action search closes with Escape',async()=>{const f=fixture();await f.ready();await f.key('KeyL');assert.equal(f.state.view,'library');assert.match(f.main,/Library results/);await f.key('KeyK',{ctrl:true});assert.match(f.overlay,/Search actions/);await f.key('Escape');assert.equal(f.overlay,'');});

test('AltP sequential naming saves one then advances and Escape leaves remaining item unchanged',async()=>{const f=fixture();await f.ready();await f.key('Tab');await f.key('KeyA',{ctrl:true});await f.key('KeyP',{alt:true});assert.match(f.overlay,/1 \/ 2/);await f.input('name-input','First named note');await f.key('Enter');assert.equal(f.state.items.find(item=>item.id===f.text1).name,'First named note');assert.equal(f.state.items.find(item=>item.id===f.text1).pinned,true);assert.match(f.overlay,/2 \/ 2/);await f.key('Escape');assert.equal(f.state.items.find(item=>item.id===f.text2).name,'');assert.equal(f.state.items.find(item=>item.id===f.text2).pinned,false);});

test('ShiftS searches enabled rows and native show reselects first item',async()=>{const f=fixture();await f.ready();await f.key('KeyS',{shift:true});await f.input('search-input','Text two');assert.match(f.main,/Text two/);assert.doesNotMatch(f.main,/Text one/);await f.key('Escape');await f.key('Tab');await f.key('ArrowRight');assert.match(f.main,/card kind-text focused selected[^>]*data-item-id="00000000-0000-4000-8000-000000000003"/);await f.key('Enter');await f.api.command('show');await f.ready();assert.match(f.main,/card kind-text focused selected[^>]*data-item-id="00000000-0000-4000-8000-000000000002"/);});


test('Settings retries pending deletion cleanup without clearing failure or deleting another record',async()=>{const f=fixture();await f.ready();await f.api.command('settings');await f.ready();assert.doesNotMatch(f.main,/data-action="retry-cleanup"/);const original=f.state.items.map(item=>item.id);f.state.needsDeletionCleanup=true;await f.api.command('settings');await f.ready();assert.match(f.main,/data-action="retry-cleanup"/);f.failCleanupOnce();await f.click('retry-cleanup');assert.equal(f.commands.at(-1).action,'cleanup');assert.deepEqual(f.commands.at(-1).payload,{});assert.equal(f.state.needsDeletionCleanup,true);assert.match(f.main,/data-action="retry-cleanup"/);assert.deepEqual(f.state.items.map(item=>item.id),original);await f.click('retry-cleanup');assert.equal(f.state.needsDeletionCleanup,false);assert.doesNotMatch(f.main,/data-action="retry-cleanup"/);assert.deepEqual(f.state.items.map(item=>item.id),original);});


test('native Settings state closes the screenshot crop preview instead of covering Settings',async()=>{const f=fixture();await f.ready();f.api.emit({viewEvent:{serial:'synthetic-capture',selectId:f.image,kind:'image',preview:true,crop:true}});await f.ready();assert.match(f.overlay,/id="preview-dialog"/);assert.match(f.overlay,/id="markup-canvas"/);await f.api.command('settings');await f.ready();assert.equal(f.overlay,'');assert.match(f.main,/class="settings-main"/);assert.match(f.main,/data-setting="theme"/);});

test('native view transition saves the current text draft once before clearing preview',async()=>{const f=fixture();await f.ready();await f.key('Tab');await f.key('Space');await f.key('KeyE');await f.input('text-editor','Edited before native Settings');await f.api.command('settings');await f.ready();assert.equal(f.state.items.find(item=>item.id===f.text1).text,'Edited before native Settings');assert.equal(f.commands.filter(command=>command.action==='editText').length,1);assert.equal(f.overlay,'');assert.match(f.main,/class="settings-main"/);});

test('failed native transition retains text draft until a successful explicit retry',async()=>{const f=fixture();await f.ready();await f.key('Tab');await f.key('Space');await f.key('KeyE');await f.input('text-editor','Keep this unsaved draft');f.failEditOnce();await f.api.command('settings');await f.ready();assert.match(f.overlay,/id="text-editor"/);assert.match(f.overlay,/Keep this unsaved draft/);assert.equal(f.state.items.find(item=>item.id===f.text1).text,'Text one');assert.doesNotMatch(f.main,/class="settings-main"/);await f.click('finish-text');assert.equal(f.state.items.find(item=>item.id===f.text1).text,'Keep this unsaved draft');assert.equal(f.overlay,'');assert.match(f.main,/class="settings-main"/);});

test('native hide clears clean preview and does not leave it on the next opening',async()=>{const f=fixture();await f.ready();await f.key('Space');assert.match(f.overlay,/id="preview-dialog"/);await f.api.command('hide');await f.ready();assert.equal(f.overlay,'');await f.api.command('show');await f.ready();assert.equal(f.overlay,'');});


test('editor requests anonymous CORS before loading managed original',async()=>{const f=fixture();await f.ready();await f.key('Space');await f.key('KeyC');assert.equal(f.imageLoads.length,1);assert.equal(f.imageLoads[0].crossOrigin,'anonymous');assert.match(f.imageLoads[0].url,/\/original$/);});

test('canvas export rejection retains dirty crop and explicit Enter retry saves it',async()=>{const f=fixture();await f.ready();await f.key('Space');await f.key('KeyC');await f.pointer('pointerdown',60,30);await f.pointer('pointermove',500,150);await f.pointer('pointerup',500,150);f.failExportOnce();await f.key('Enter');assert.match(f.overlay,/id="markup-canvas"/);assert.equal(f.commands.filter(command=>command.action==='saveImage').length,0);assert.match(f.nodes.get('toast').textContent,/Image changes could not be saved/);await f.key('Enter');assert.doesNotMatch(f.overlay,/id="markup-canvas"/);assert.deepEqual(f.state.items.find(item=>item.id===f.image).crop,{x:60,y:30,width:440,height:120});});

test('canvas export failure blocks native Settings until explicit Save succeeds',async()=>{const f=fixture();await f.ready();await f.key('Space');await f.key('KeyC');await f.pointer('pointerdown',60,30);await f.pointer('pointermove',500,150);await f.pointer('pointerup',500,150);f.failExportOnce();await f.api.command('settings');await f.ready();assert.match(f.overlay,/id="markup-canvas"/);assert.doesNotMatch(f.main,/class="settings-main"/);await f.click('save-image');assert.equal(f.overlay,'');assert.match(f.main,/class="settings-main"/);assert.deepEqual(f.state.items.find(item=>item.id===f.image).crop,{x:60,y:30,width:440,height:120});});

test('Tab saves dirty image crop before switching the open preview; Enter copies the visible text',async()=>{
 const f=fixture();await f.ready();await f.key('Space');await f.key('KeyC');
 await f.pointer('pointerdown',60,30);await f.pointer('pointermove',500,150);await f.pointer('pointerup',500,150);
 await f.key('Tab');
 assert.deepEqual(f.state.items.find(item=>item.id===f.image).crop,{x:60,y:30,width:440,height:120});
 assert.equal(f.commands.filter(command=>command.action==='saveImage').length,1);
 assert.match(f.overlay,/aria-label="Text one"/);
 assert.doesNotMatch(f.overlay,/editing-toolbar|id="markup-canvas"/);
 await f.key('Enter');
 assert.equal(f.commands.at(-1).action,'copy');
 assert.deepEqual(f.commands.at(-1).payload.ids,[f.text1]);
 assert.equal(f.state.windowVisible,false);assert.equal(f.overlay,'');
 assert.equal(f.commands.filter(command=>command.action==='saveImage').length,1);
});

test('failed crop export aborts Tab shelf switching and keeps the draft available for retry',async()=>{
 const f=fixture();await f.ready();await f.key('Space');await f.key('KeyC');
 await f.pointer('pointerdown',60,30);await f.pointer('pointermove',500,150);await f.pointer('pointerup',500,150);
 f.failExportOnce();await f.key('Tab');
 assert.match(f.overlay,/aria-label="Synthetic image"/);
 assert.match(f.overlay,/editing-toolbar/);assert.match(f.overlay,/id="markup-canvas"/);
 assert.match(f.main,/card kind-image focused selected/);
 assert.equal(f.commands.filter(command=>['saveImage','copy'].includes(command.action)).length,0);
 assert.equal(f.state.items.find(item=>item.id===f.image).crop,undefined);
 await f.key('Tab');
 assert.deepEqual(f.state.items.find(item=>item.id===f.image).crop,{x:60,y:30,width:440,height:120});
 assert.match(f.overlay,/aria-label="Text one"/);
 assert.doesNotMatch(f.overlay,/editing-toolbar|id="markup-canvas"/);
});

test('Settings hides browsing selection and keyboard hints while Library retains its footer',async()=>{
 const f=fixture();await f.ready();await f.key('KeyP');await f.api.command('library');await f.ready();
 assert.match(f.main,/class="statusbar"/);assert.match(f.main,/1 selected/);
 await f.api.command('settings');await f.ready();
 assert.match(f.main,/class="settings-main"/);
 assert.doesNotMatch(f.main,/class="statusbar"|class="key-legend"|1 selected/);
});


test('Settings browsing keys do not pin, copy or paste the last shelf selection',async()=>{const f=fixture();await f.ready();await f.api.command('settings');await f.ready();await f.key('KeyP');await f.key('Enter');await f.key('Enter',{ctrl:true});assert.equal(f.state.items.find(item=>item.id===f.image).pinned,false);assert.equal(f.commands.filter(command=>['pin','copy','paste'].includes(command.action)).length,0);await f.key('KeyK',{ctrl:true});assert.match(f.overlay,/Search actions/);});

test('fresh opening skips an empty enabled image shelf so Space and Enter operate on the first text',async()=>{
 const f=fixture();await f.ready();
 f.api.emit({items:f.state.items.filter(value=>value.kind!=='image')});
 await f.api.command('show');await f.ready();
 assert.match(f.main,/card kind-text focused selected/);
 await f.key('Space');assert.match(f.overlay,/aria-label="Text one"/);
 await f.key('Enter');
 assert.equal(f.commands.at(-1).action,'copy');
 assert.deepEqual(f.commands.at(-1).payload.ids,[f.text1]);
 assert.equal(f.state.windowVisible,false);
});

test('fresh focus skips empty or disabled kinds and safely handles every shelf empty',async()=>{
 const f=fixture();await f.ready();
 f.api.emit({items:f.state.items.filter(value=>value.kind!=='image'),settings:{...f.state.settings,visibleKinds:['image','link']}});
 await f.api.command('show');await f.ready();
 assert.match(f.main,/card kind-link focused selected/);
 await f.key('Space');assert.match(f.overlay,/aria-label="Reference link"/);
 await f.key('Escape');
 f.api.emit({items:[]});await f.api.command('show');await f.ready();
 const commands=f.commands.length;await f.key('Space');await f.key('Enter');
 assert.equal(f.overlay,'');assert.equal(f.commands.length,commands);
});

test('folder menu arrows retain folder operations and Enter creates a subfolder under the chosen folder',async()=>{
 const f=fixture();await f.ready();const folderId='10000000-0000-4000-8000-000000000000';
 f.api.emit({folders:[{id:folderId,name:'Chosen folder',parentId:null}]});
 await f.api.command('library');await f.click('folder-menu',{folder:folderId});
 assert.match(f.overlay,/Rename folder/);assert.match(f.overlay,/New subfolder/);assert.match(f.overlay,/Remove folder/);
 await f.key('ArrowDown');
 assert.match(f.overlay,/dialog-option selected[^>]*data-action="new-subfolder"/);
 assert.doesNotMatch(f.overlay,/Search actions|execute-command/);
 await f.key('Enter');assert.match(f.overlay,/New folder/);
 await f.input('simple-input','Child folder');await f.key('Enter');
 assert.equal(f.commands.at(-1).action,'createFolder');
 assert.deepEqual(f.commands.at(-1).payload,{name:'Child folder',parentId:folderId});
 assert.equal(f.commands.filter(command=>['copy','paste','pin','remove'].includes(command.action)).length,0);
});

test('folder menu Enter renames its folder and Escape cancels remaining folder actions',async()=>{
 const f=fixture();await f.ready();const folderId='10000000-0000-4000-8000-000000000000';
 f.api.emit({folders:[{id:folderId,name:'Chosen folder',parentId:null}]});
 await f.api.command('library');await f.click('folder-menu',{folder:folderId});
 await f.key('Enter');assert.match(f.overlay,/Rename folder/);
 await f.input('simple-input','Renamed folder');await f.key('Enter');
 assert.equal(f.commands.at(-1).action,'renameFolder');
 assert.deepEqual(f.commands.at(-1).payload,{id:folderId,name:'Renamed folder'});
 await f.click('folder-menu',{folder:folderId});await f.key('ArrowDown');
 const commands=f.commands.length;await f.key('Escape');
 assert.equal(f.overlay,'');assert.equal(f.commands.length,commands);
});

test('folder menu removal requires its confirmation and never removes an item instead',async()=>{
 const f=fixture();await f.ready();const folderId='10000000-0000-4000-8000-000000000000';
 f.api.emit({folders:[{id:folderId,name:'Chosen folder',parentId:null}]});
 await f.api.command('library');await f.click('folder-menu',{folder:folderId});
 await f.key('ArrowDown');await f.key('ArrowDown');
 assert.match(f.overlay,/dialog-option selected[^>]*data-action="remove-folder"/);
 await f.key('Enter');assert.match(f.overlay,/Item content remains in the library/);
 assert.equal(f.commands.filter(command=>command.action==='removeFolder').length,0);
 await f.key('Enter');assert.equal(f.commands.at(-1).action,'removeFolder');
 assert.deepEqual(f.commands.at(-1).payload,{id:folderId});
 assert.equal(f.commands.filter(command=>['copy','paste','pin','remove','trash'].includes(command.action)).length,0);
});
