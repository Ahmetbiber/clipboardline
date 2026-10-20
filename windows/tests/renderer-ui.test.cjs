'use strict';
// Runs the actual renderer handlers with a small DOM/IPC fixture. These cases
// validate UI state transitions, not browser layout or native Windows paste.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');

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
  if(action==='setSettings'){const patch=payload.patch||{};state.settings={...state.settings,...patch,localShortcuts:{...state.settings.localShortcuts,...patch.localShortcuts}};}
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
 async function key(code,{ctrl=false,alt=false,shift=false,key,target}={}){const event={code,key:key||(/^Key/.test(code)?code.slice(3).toLowerCase():code==='Space'?' ':code),ctrlKey:ctrl,metaKey:false,altKey:alt,shiftKey:shift,repeat:false,target:target||new Element(),preventDefault(){this.prevented=true;}};for(const listener of listeners.get('keydown')||[])await listener(event);await ready();return event;}
 async function click(action,extra={}){const target=new Element();target.dataset.action=action;Object.assign(target.dataset,extra);target.closest=selector=>selector==='[data-action]'?target:null;for(const listener of listeners.get('click')||[])listener({target,stopPropagation(){}});await ready();}
 async function pointer(type,x,y){const target=document.getElementById('markup-canvas');for(const listener of listeners.get(type)||[])listener({target,clientX:x,clientY:y,pointerId:1,shiftKey:false,preventDefault(){}});await ready();}
 async function input(id,value){const target=document.getElementById(id);target.value=value;target.selectionStart=value.length;for(const listener of listeners.get('input')||[])await listener({target});await ready();}
 return{ready,key,input,click,pointer,imageLoads,failExportOnce(){exportFailures++;},failCleanupOnce(){cleanupFailures++;},failEditOnce(){editFailures++;},state,commands,nodes,image,text1,text2,link,api,get main(){return nodes.get('app').innerHTML;},get overlay(){return nodes.get('overlay-root').innerHTML;}};
}

function selectedCards(f){return [...f.main.matchAll(/<article class="([^"]*)"[^>]*data-item-id="([^"]+)"/g)].filter(match=>match[1].split(' ').includes('selected')).map(match=>match[2]);}
function activeKind(f){return f.main.match(/class="shelf active-shelf" data-shelf="([^"]+)"/)?.[1];}
function focusedCard(f){return [...f.main.matchAll(/<article class="([^"]*)"[^>]*data-item-id="([^"]+)"/g)].find(match=>match[1].split(' ').includes('focused'))?.[2];}
function navigationItems(f,{image=13,text=11,link=10}={}){let serial=0;const values={};for(const [kind,count]of Object.entries({image,text,link})){const source=f.state.items.find(value=>value.kind===kind);values[kind]=Array.from({length:count},(_,index)=>({...structuredClone(source),id:'10000000-0000-4000-8000-'+String(++serial).padStart(12,'0'),createdAt:10000-index,name:kind==='image'?'Navigation image '+index:'',text:kind==='text'?'Navigation text '+index:'',title:kind==='link'?'Navigation link '+index:'',url:kind==='link'?'https://example.com/navigation/'+index:''}));}return values;}

test('fresh shelves select only the first image; P pins it; Space previews it',async()=>{const f=fixture();await f.ready();assert.match(f.main,/card kind-image focused selected/);assert.deepEqual(selectedCards(f),[f.image]);await f.key('KeyP');assert.equal(f.state.items[0].pinned,true);await f.key('Space');assert.match(f.overlay,/id="preview-dialog"/);assert.match(f.overlay,/aria-label="Synthetic image"/);});

test('preview arrows move across shelf kinds, S keeps preview on neighbor, Backspace restores',async()=>{const f=fixture();await f.ready();await f.key('Space');await f.key('ArrowDown');assert.match(f.overlay,/aria-label="Text one"/);await f.key('KeyS');assert.match(f.overlay,/aria-label="Text two"/);assert.ok(f.state.items.find(item=>item.id===f.text1).trashedAt);await f.key('Backspace');assert.match(f.overlay,/aria-label="Text one"/);assert.equal(f.state.items.find(item=>item.id===f.text1).trashedAt,null);});

test('preview CtrlC keeps open; Enter copies exact current item and dismisses',async()=>{const f=fixture();await f.ready();await f.key('Space');await f.key('ArrowDown');await f.key('KeyC',{ctrl:true});assert.equal(f.commands.at(-1).action,'copy');assert.equal(f.commands.at(-1).payload.keepOpen,true);assert.match(f.overlay,/id="preview-dialog"/);await f.key('Enter');assert.equal(f.commands.at(-1).payload.ids[0],f.text1);assert.equal(f.commands.at(-1).payload.keepOpen,false);assert.equal(f.state.windowVisible,false);assert.equal(f.overlay,'');});

test('L opens Library; CtrlK action search closes with Escape',async()=>{const f=fixture();await f.ready();await f.key('KeyL');assert.equal(f.state.view,'library');assert.match(f.main,/Library results/);await f.key('KeyK',{ctrl:true});assert.match(f.overlay,/Search actions/);await f.key('Escape');assert.equal(f.overlay,'');});

test('AltP sequential naming saves one then advances and Escape leaves remaining item unchanged',async()=>{const f=fixture();await f.ready();await f.key('Tab');await f.key('KeyA',{ctrl:true});await f.key('KeyP',{alt:true});assert.match(f.overlay,/1 \/ 2/);await f.input('name-input','First named note');await f.key('Enter');assert.equal(f.state.items.find(item=>item.id===f.text1).name,'First named note');assert.equal(f.state.items.find(item=>item.id===f.text1).pinned,true);assert.match(f.overlay,/2 \/ 2/);await f.key('Escape');assert.equal(f.state.items.find(item=>item.id===f.text2).name,'');assert.equal(f.state.items.find(item=>item.id===f.text2).pinned,false);});

test('ShiftS searches enabled rows and native reopen resets to only the first image',async()=>{const f=fixture();await f.ready();await f.key('KeyS',{shift:true});await f.input('search-input','Text two');assert.match(f.main,/Text two/);assert.doesNotMatch(f.main,/Text one/);await f.key('Escape');await f.key('Tab');await f.key('ArrowRight');assert.match(f.main,/card kind-text focused selected[^>]*data-item-id="00000000-0000-4000-8000-000000000003"/);await f.key('Enter');await f.api.command('show');await f.ready();assert.equal(activeKind(f),'image');assert.deepEqual(selectedCards(f),[f.image]);});


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

test('closed preview arrows cross shelves by full item column, clamp without wrapping, and keep Left/Right horizontal',async()=>{
 const f=fixture();await f.ready();const values=navigationItems(f);f.api.emit({items:Object.values(values).flat()});await f.ready();
 await f.key('ArrowRight',{ctrl:true});assert.equal(focusedCard(f),values.image[12].id);
 await f.key('ArrowDown');assert.equal(activeKind(f),'text');assert.deepEqual(selectedCards(f),[values.text[10].id]);
 await f.key('ArrowDown');assert.equal(activeKind(f),'link');assert.deepEqual(selectedCards(f),[values.link[9].id]);
 await f.key('ArrowDown');assert.equal(focusedCard(f),values.link[9].id);
 await f.key('ArrowUp');assert.equal(activeKind(f),'text');assert.deepEqual(selectedCards(f),[values.text[9].id]);
 await f.key('ArrowUp');assert.equal(activeKind(f),'image');assert.deepEqual(selectedCards(f),[values.image[9].id]);
 await f.key('ArrowUp');assert.equal(focusedCard(f),values.image[9].id);
 await f.key('ArrowLeft');assert.equal(activeKind(f),'image');assert.equal(focusedCard(f),values.image[8].id);
 await f.key('ArrowRight');assert.equal(focusedCard(f),values.image[9].id);assert.equal(f.overlay,'');
});

test('vertical navigation skips filtered empty and hidden shelves and Space/Enter use the destination',async()=>{
 const f=fixture();await f.ready();await f.click('pinned-kind',{kind:'text'});await f.click('activate-shelf',{kind:'image'});
 await f.key('ArrowDown');assert.equal(activeKind(f),'link');assert.deepEqual(selectedCards(f),[f.link]);
 await f.key('Space');assert.match(f.overlay,/aria-label="Reference link"/);
 await f.key('ArrowUp');assert.match(f.overlay,/aria-label="Synthetic image"/);assert.deepEqual(selectedCards(f),[f.image]);
 await f.key('Escape');await f.key('KeyL',{shift:true});await f.key('ArrowDown');assert.equal(activeKind(f),'image');assert.deepEqual(selectedCards(f),[f.image]);
 assert.doesNotMatch(f.main,/data-shelf="link"/);await f.key('Enter');assert.deepEqual(f.commands.at(-1).payload.ids,[f.image]);assert.equal(f.state.windowVisible,false);
});

test('row toggles preserve the active batch and enabling other shelves adds no selection',async()=>{
 const f=fixture();await f.ready();await f.key('ArrowDown');await f.key('ArrowRight');await f.key('KeyA',{ctrl:true});
 assert.deepEqual(selectedCards(f),[f.text1,f.text2]);
 for(const action of ['KeyL','KeyL','KeyI','KeyI']){await f.key(action,{shift:true});assert.equal(activeKind(f),'text');assert.equal(focusedCard(f),f.text2);assert.deepEqual(selectedCards(f),[f.text1,f.text2]);}
 await f.key('KeyT',{shift:true});assert.equal(activeKind(f),'image');assert.deepEqual(selectedCards(f),[f.image]);
 await f.key('KeyT',{shift:true});assert.deepEqual(selectedCards(f),[f.image]);assert.equal(activeKind(f),'image');
});

test('fresh native reveal clears stale search, quick pages and selection then prefers images',async()=>{
 const f=fixture();await f.ready();const values=navigationItems(f);f.api.emit({items:Object.values(values).flat()});await f.ready();
 await f.key('ArrowRight',{alt:true});assert.notEqual(focusedCard(f),values.image[0].id);
 await f.key('KeyS',{shift:true});await f.input('search-input','Navigation text 10');assert.match(f.main,/Navigation text 10/);
 await f.api.command('hide');await f.api.command('show');await f.ready();
 assert.equal(activeKind(f),'image');assert.deepEqual(selectedCards(f),[values.image[0].id]);assert.doesNotMatch(f.main,/search-hud|search-summary/);
 await f.key('Digit1');assert.equal(focusedCard(f),values.image[0].id);
 await f.key('ArrowDown');assert.deepEqual(selectedCards(f),[values.text[0].id]);
 await f.key('Space');assert.match(f.overlay,/aria-label="Navigation text 0"/);await f.key('Enter');assert.deepEqual(f.commands.at(-1).payload.ids,[values.text[0].id]);
});

test('hidden or filtered images use first visible nonempty shelf and reopening never keeps a text default when images return',async()=>{
 const f=fixture();await f.ready();await f.key('KeyI',{shift:true});assert.equal(activeKind(f),'text');assert.deepEqual(selectedCards(f),[f.text1]);
 await f.api.command('hide');await f.api.command('show');await f.ready();assert.equal(activeKind(f),'text');assert.deepEqual(selectedCards(f),[f.text1]);
 await f.key('KeyI',{shift:true});assert.equal(activeKind(f),'text');assert.deepEqual(selectedCards(f),[f.text1]);
 await f.api.command('hide');await f.api.command('show');await f.ready();assert.equal(activeKind(f),'image');assert.deepEqual(selectedCards(f),[f.image]);
 await f.click('pinned-kind',{kind:'image'});await f.api.command('hide');await f.api.command('show');await f.ready();assert.equal(activeKind(f),'text');assert.deepEqual(selectedCards(f),[f.text1]);
});

test('native search typing stays in its editor and Shift arrows extend only the current row',async()=>{
 const f=fixture();await f.ready();await f.key('ArrowDown');await f.key('ArrowDown',{shift:true});assert.equal(activeKind(f),'text');assert.deepEqual(selectedCards(f),[f.text1,f.text2]);
 await f.key('KeyS',{shift:true});const editor=f.nodes.get('search-input');editor.matches=selector=>selector.includes('input');
 const before=f.commands.length;for(const code of ['Space','ArrowLeft','ArrowRight'])assert.equal((await f.key(code,{target:editor})).prevented,undefined);
 assert.equal(f.commands.length,before);assert.equal(activeKind(f),'text');assert.equal(f.overlay,'');
 await f.input('search-input','Text');await f.key('Enter',{target:editor});assert.equal(activeKind(f),'text');assert.deepEqual(selectedCards(f),[f.text1]);
 await f.key('ArrowDown');assert.equal(activeKind(f),'text','Empty result shelves do not wrap');
});

test('global native search survives a hidden resize broadcast before the same event becomes visible',async()=>{
 const f=fixture();await f.ready();await f.api.command('hide');await f.ready();
 const viewEvent={search:true,serial:'global-search-before-window-show'};
 f.api.emit({windowVisible:false,viewEvent});await f.ready();
 assert.doesNotMatch(f.main,/class="search-hud"/);assert.deepEqual(selectedCards(f),[]);
 f.api.emit({windowVisible:true,viewEvent});await f.ready();
 assert.match(f.main,/class="search-hud"/);assert.deepEqual(selectedCards(f),[f.image]);
 f.api.emit({windowVisible:true,viewEvent});await f.ready();assert.match(f.main,/class="search-hud"/);
 await f.key('Escape');assert.doesNotMatch(f.main,/class="search-hud"/);
 f.api.emit({windowVisible:true,viewEvent});await f.ready();
 assert.doesNotMatch(f.main,/class="search-hud"/,'An unchanged broadcast must not reopen a dismissed search');
});

test('native image preview and crop event wait until the hidden window is shown',async()=>{
 const f=fixture();await f.ready();await f.api.command('hide');await f.ready();
 const viewEvent={selectId:f.image,kind:'image',preview:true,crop:true,serial:'capture-before-window-show'};
 f.api.emit({windowVisible:false,viewEvent});await f.ready();assert.equal(f.overlay,'');assert.equal(f.imageLoads.length,0);
 f.api.emit({windowVisible:true,viewEvent});await f.ready();
 assert.match(f.overlay,/id="preview-dialog"/);assert.match(f.overlay,/id="markup-canvas"/);assert.equal(f.imageLoads.length,1);
 f.api.emit({windowVisible:true,viewEvent});await f.ready();assert.equal(f.imageLoads.length,1,'The same event must not recreate its editor');
});

test('shared macOS/Windows shelf contract runs through actual renderer handlers',async()=>{
 const contractFile=path.resolve(__dirname,'../../contracts/shelf-behavior.json'),raw=fs.readFileSync(contractFile),contract=JSON.parse(raw);
 assert.equal(contract.schemaVersion,1);assert.equal(contract.contractId,'clipboardline.shelves.v1');
 const observations=[],errors=[];
 for(const scenario of contract.scenarios){
  const f=fixture();await f.ready();const aliases=new Map(),values=contract.itemSets[scenario.itemSet].map((entry,index)=>{
   const id='20000000-0000-4000-8000-'+String(index+1).padStart(12,'0');aliases.set(id,entry.id);
   const source=f.state.items.find(value=>value.kind===entry.kind);
   return{...structuredClone(source),id,createdAt:10000-index,name:entry.kind==='image'?entry.text:'',text:entry.kind==='text'?entry.text:'',title:entry.kind==='link'?entry.text:'',url:entry.kind==='link'?'https://example.com/contract/'+entry.id:''};
  });
  f.api.emit({items:values,settings:{...f.state.settings,visibleKinds:scenario.visibleKinds}});await f.ready();
  for(const kind of scenario.pinnedOnlyKinds||[])await f.click('pinned-kind',{kind});
  await f.api.command('hide');await f.ready();
  for(let index=0;index<scenario.steps.length;index++){
   const step=scenario.steps[index];const editor=f.nodes.get('search-input');if(editor)editor.matches=selector=>selector.includes('input');
   const searchEditing=/class="search-hud"/.test(f.main);
   if(step.action==='open')await f.api.command('show');
   else if(step.action==='close')await f.api.command('hide');
   else if(['up','down','left','right'].includes(step.action))await f.key({up:'ArrowUp',down:'ArrowDown',left:'ArrowLeft',right:'ArrowRight'}[step.action],searchEditing?{target:editor}:{});
   else if(step.action==='toggle')await f.key({image:'KeyI',text:'KeyT',link:'KeyL'}[step.kind],{shift:true});
   else if(step.action==='openSearch')await f.key('KeyS',{shift:true});
   else if(step.action==='finishSearch')await f.key('Enter',{target:editor});
   else throw new Error('Unsupported shared contract action: '+step.action);
   await f.ready();
   const actual={activeKind:activeKind(f),focused:aliases.get(focusedCard(f))||null,selected:selectedCards(f).map(id=>aliases.get(id)||id).sort(),visibleKinds:[...f.main.matchAll(/<section class="shelf(?: active-shelf)?\s*" data-shelf="([^"]+)"/g)].map(match=>match[1]),searchEditing:/class="search-hud"/.test(f.main)};
   observations.push({scenarioId:scenario.id,step:index,actual});
   try{assert.deepEqual(actual,step.expect);}catch(error){errors.push(scenario.id+' step '+index+': '+error.message);}
  }
 }
 if(process.env.CLIPBOARDLINE_PARITY_REPORT){
  const revision=process.env.GITHUB_SHA||execFileSync('git',['rev-parse','HEAD'],{cwd:path.resolve(__dirname,'../..'),encoding:'utf8'}).trim();
  const implementationSHA256=crypto.createHash('sha256').update(fs.readFileSync(path.resolve(__dirname,'../renderer.js'))).digest('hex');
  const report={schemaVersion:1,contractId:contract.contractId,platform:'windows',hostPlatform:process.platform,mode:'renderer',sourceRevision:revision,contractSHA256:crypto.createHash('sha256').update(raw).digest('hex'),implementationSHA256,implementationFiles:{'windows/renderer.js':implementationSHA256},observations,passed:errors.length===0,errors};
  fs.mkdirSync(path.dirname(path.resolve(process.env.CLIPBOARDLINE_PARITY_REPORT)),{recursive:true});fs.writeFileSync(process.env.CLIPBOARDLINE_PARITY_REPORT,JSON.stringify(report,null,2)+'\n');
 }
 assert.deepEqual(errors,[]);
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
