'use strict';
// Exercises the shipped Library and preview renderer against an isolated IPC/DOM
// fixture. Native geometry and app integration are checked separately on Windows.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');

function fixture({deferInitialState=false,initialVisible=true}={}){
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
 const document={body:new Element('body'),activeElement:null,getElementById(id){if(!nodes.has(id))nodes.set(id,id==='markup-canvas'?new Canvas(id):new Element(id));return nodes.get(id);},createElement(tag){return tag==='canvas'?new Canvas():new Element();},querySelector(){return null;},querySelectorAll(){return [];},addEventListener(name,listener){if(!listeners.has(name))listeners.set(name,[]);listeners.get(name).push(listener);}};
 const image='00000000-0000-4000-8000-000000000001',text1='00000000-0000-4000-8000-000000000002',text2='00000000-0000-4000-8000-000000000003',link='00000000-0000-4000-8000-000000000004';
 const base=(id,kind,createdAt,extra)=>({id,kind,createdAt,updatedAt:createdAt,name:'',title:'',text:'',url:'',pinned:false,folderIds:[],tags:[],trashedAt:null,hiddenFromShelf:false,crop:null,annotations:[],...extra});
 const state={items:[base(image,'image',1000,{name:'Synthetic image',mediaUrl:'appmedia://media/'+image,originalMediaUrl:'appmedia://media/'+image+'/original'}),base(text1,'text',900,{text:'Text one'}),base(text2,'text',800,{text:'Text two'}),base(link,'link',700,{url:'https://example.com/reference',title:'Reference link'})],folders:[],settings:{visibleKinds:['image','text','link'],retentionDays:{image:30,text:30,link:30},shortcuts:{toggle:'Control+Alt+Space',search:'Control+Alt+S'},localShortcuts:{},language:'en',theme:'soft',cardSize:'medium'},view:'shelves',version:'1.7.0',windowVisible:initialVisible,canUndo:false};
 let subscriber,removed=[],cleanupFailures=0,editFailures=0,delayedReply=null,releaseInitialState,visualSearch=()=>({ids:[],scores:[],available:false,indexing:false}),detailsFailures=0;
 const clone=value=>structuredClone(value);
 const api={emit(patch){Object.assign(state,patch);subscriber?.(clone(state));},state:async()=>{const initial=clone(state);if(deferInitialState)await new Promise(resolve=>{releaseInitialState=resolve;});return initial;},subscribe(fn){subscriber=fn;return()=>{};},async command(action,payload={}){commands.push({action,payload:clone(payload)});const selected=state.items.filter(item=>(payload.ids||[payload.id]).includes(item.id));
  let cleanupError;if(action==='cleanup'){if(cleanupFailures){cleanupFailures--;cleanupError='Permanent deletion cleanup is still pending.';}else state.needsDeletionCleanup=false;}
  if(action==='editText'){if(editFailures){editFailures--;cleanupError='Synthetic draft write failure';}else selected.forEach(item=>item.text=payload.text);}
  if(action==='setSettings'){const patch=payload.patch||{},localShortcuts={...state.settings.localShortcuts,...patch.localShortcuts};for(const [action,value]of Object.entries(localShortcuts))if(value===null)delete localShortcuts[action];state.settings={...state.settings,...patch,localShortcuts};}
  if(action==='saveImage')selected.forEach(item=>{item.crop=clone(payload.crop);item.annotations=clone(payload.annotations);});
  if(action==='details'){if(detailsFailures){detailsFailures--;cleanupError='Synthetic atomic inspector write failure';}else selected.forEach(item=>{for(const key of ['name','text','note'])if(Object.hasOwn(payload,key))item[key]=payload[key];});}
  if(action==='note')selected.forEach(item=>item.note=payload.note);
  if(action==='retain')selected.forEach(item=>item.retainedAt=Date.now());
  if(action==='unassign')selected.forEach(item=>item.folderIds=item.folderIds.filter(id=>id!==payload.folderId));
  if(action==='removeTag')selected.forEach(item=>item.tags=item.tags.filter(tag=>tag!==payload.tag));
  if(action==='pin')selected.forEach(item=>item.pinned=typeof payload.value==='boolean'?payload.value:!item.pinned);
  if(action==='name')selected.forEach(item=>{item.name=payload.name;item.pinned=true;});
  if(action==='remove'){removed=selected.map(clone);selected.forEach(item=>{if(item.pinned)item.hiddenFromShelf=true;else item.trashedAt=Date.now();});state.canUndo=true;}
  if(action==='undo'){for(const before of removed)Object.assign(state.items.find(item=>item.id===before.id),before);state.canUndo=false;}
  if(action==='copy'&&!payload.keepOpen||action==='paste'||action==='hide')state.windowVisible=false;
  if(action==='show'){state.view='shelves';state.windowVisible=true;state.viewEvent={serial:String(commands.length)};}
  if(action==='library'||action==='settings'){state.view=action;state.windowVisible=true;}
  const output=clone(state);if(action==='searchImages')output.result=await visualSearch(clone(payload));if(cleanupError)output.result={error:cleanupError};subscriber?.(output);
  if(delayedReply?.action===action){const pending=delayedReply;delayedReply=null;await pending.promise;}
  return output;
 }};
 const context={window:{clipboardLine:api,addEventListener(){}},document,HTMLElement:Element,HTMLTextAreaElement:TextArea,Image:FixtureImage,console,structuredClone,URL,Set,Date,JSON,Math,Number,String,requestAnimationFrame:fn=>fn(),setTimeout:fn=>{queueMicrotask(fn);return 1;},clearTimeout(){}};
 vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(__dirname,'../renderer.js'),'utf8'),context,{filename:'renderer.js'});
 async function ready(){await new Promise(setImmediate);}
 async function key(code,{ctrl=false,alt=false,shift=false,key,target}={}){const event={code,key:key||(/^Key/.test(code)?code.slice(3).toLowerCase():code==='Space'?' ':code),ctrlKey:ctrl,metaKey:false,altKey:alt,shiftKey:shift,repeat:false,target:target||new Element(),preventDefault(){this.prevented=true;}};for(const listener of listeners.get('keydown')||[])await listener(event);await ready();return event;}
 async function click(action,extra={}){const target=new Element();target.dataset.action=action;Object.assign(target.dataset,extra);target.closest=selector=>selector==='[data-action]'?target:null;for(const listener of listeners.get('click')||[])listener({target,stopPropagation(){}});await ready();}
 async function pointer(type,x,y){const target=document.getElementById('markup-canvas');for(const listener of listeners.get(type)||[])listener({target,clientX:x,clientY:y,pointerId:1,shiftKey:false,preventDefault(){}});await ready();}
 function columnGrip(column){const target=new Element();target.dataset.listColumn=column;target.closest=selector=>selector==='[data-list-column]'?target:null;return target;}
 async function columnDrag(column,from,to,cancel=false){const target=columnGrip(column);for(const [type,x]of [['pointerdown',from],['pointermove',to],[cancel?'pointercancel':'pointerup',to]]){for(const listener of listeners.get(type)||[])await listener({target,clientX:x,clientY:0,pointerId:1,shiftKey:false,preventDefault(){},stopPropagation(){}});await ready();}}
 async function drag(id,{alt=false}={}){const card=new Element();card.dataset.itemId=id;card.closest=selector=>selector==='[data-item-id]'?card:null;const data=new Map(),event={target:card,altKey:alt,dataTransfer:{effectAllowed:'',setData(type,value){data.set(type,value);}},preventDefault(){this.prevented=true;}};for(const listener of listeners.get('dragstart')||[])await listener(event);await ready();return{prevented:event.prevented,data,effectAllowed:event.dataTransfer.effectAllowed};}
 async function input(id,value){const target=document.getElementById(id);target.value=value;target.selectionStart=value.length;for(const listener of listeners.get('input')||[])await listener({target});await ready();}
 async function change(id,value,extra={}){const target=document.getElementById(id);target.value=value;Object.assign(target,extra);if(extra.dataset)target.dataset=extra.dataset;for(const listener of listeners.get('change')||[])await listener({target});await ready();}
 return{ready,key,input,click,change,pointer,columnGrip,columnDrag,drag,setVisualSearch(callback){visualSearch=callback;},failDetails(count=1){detailsFailures=count;},imageLoads,releaseInitialState(){releaseInitialState?.();},deferReply(action){let release;const promise=new Promise(resolve=>{release=resolve;});delayedReply={action,promise};return release;},failExportOnce(){exportFailures++;},failCleanupOnce(){cleanupFailures++;},failEditOnce(){editFailures++;},state,commands,nodes,image,text1,text2,link,api,get main(){return nodes.get('app').innerHTML;},get overlay(){return nodes.get('overlay-root').innerHTML;}};
}

function cards(f){return [...f.main.matchAll(/<article class="[^"]*"[^>]*data-item-id="([^"]+)"/g)].map(match=>match[1]);}
async function recent(f){await f.key('KeyL');await f.click('scope',{scope:'recent'});}

test('image browsing previews use rendered full resolution instead of cached thumbnail and no permanent footer',async()=>{
 const f=fixture();await f.ready();f.state.items[0].thumbnailUrl='appmedia://media/'+f.image+'/thumbnail';f.api.emit({items:f.state.items});await f.ready();await f.key('Space');
 assert.match(f.overlay,new RegExp('id="preview-media" src="appmedia://media/'+f.image+'"'));
 assert.doesNotMatch(f.overlay,/preview-footer|\/thumbnail"/);
 assert.match(f.overlay,/role="toolbar" aria-label="Preview controls"/);
 assert.match(f.overlay,/data-action="pin"[^>]*aria-pressed="false"/);
 assert.doesNotMatch(f.overlay,/>◆<|>⧉</);
});

test('Library notes and memberships have focused controls and use captured target IDs',async()=>{
 const f=fixture();await f.ready();const text=f.state.items.find(value=>value.id===f.text1);text.pinned=true;text.note='A searchable note';text.folderIds=['20000000-0000-4000-8000-000000000001'];text.tags=['client'];f.state.folders=[{id:text.folderIds[0],name:'Client work'}];f.api.emit({items:f.state.items,folders:f.state.folders});await f.ready();await recent(f);await f.key('KeyC',{ctrl:true});await f.key('ArrowRight');
 assert.match(f.main,/id="detail-note"[^>]*>A searchable note<\/textarea>/);
 await f.input('detail-note','Updated organization note');await f.click('save-detail-note');assert.equal(text.note,'Updated organization note');assert.deepEqual(f.commands.at(-1),{action:'note',payload:{id:f.text1,note:'Updated organization note'}});
 await f.click('remove-item-folder',{id:f.text1,folder:text.folderIds[0]});assert.equal(text.folderIds.length,0);assert.equal(f.commands.at(-1).action,'unassign');
 await f.click('remove-item-tag',{id:f.text1,tag:'client'});assert.deepEqual(text.tags,[]);assert.equal(f.commands.at(-1).action,'removeTag');
});

test('Library multi-tag filters require every selected tag and Clear filters restores results',async()=>{
 const f=fixture();await f.ready();f.state.items[0].tags=['work','client'];f.state.items[1].tags=['work'];f.state.items[2].tags=['client'];f.api.emit({items:f.state.items});await f.ready();await recent(f);await f.click('toggle-filters');
 assert.match(f.main,/Tags \(match all\)/);
 await f.change('filter-work','',{dataset:{filterTag:'work'},checked:true});assert.deepEqual(cards(f),[f.image,f.text1]);
 await f.change('filter-client','',{dataset:{filterTag:'client'},checked:true});assert.deepEqual(cards(f),[f.image]);
 await f.click('clear-filters');assert.equal(cards(f).length,4);
});

test('Library title descending and best match order actual result identities',async()=>{
 const f=fixture();await f.ready();f.state.items[0].name='Zulu reference';f.state.items[1].text='Alpha reference';f.api.emit({items:f.state.items});await f.ready();await recent(f);
 await f.change('sort-filter','titleDescending');assert.deepEqual(cards(f),[f.image,f.text2,f.link,f.text1]);
 f.state.items[0].name='reference';f.api.emit({items:f.state.items});await f.ready();await f.input('search-input','reference');await f.change('sort-filter','relevance');assert.deepEqual(cards(f),[f.image,f.text1,f.link]);
});

test('Library List exposes Title Type Tags Added columns without image-card empty space',async()=>{
 const f=fixture();await f.ready();await recent(f);await f.click('view-mode');assert.match(f.main,/library-list-header/);assert.match(f.main,/list-title/);assert.match(f.main,/list-kind/);assert.match(f.main,/list-tags/);assert.match(f.main,/list-added/);assert.doesNotMatch(f.main,/class="library-media"/);
});

test('empty My library explains retention and View recent copies is actionable',async()=>{
 const f=fixture();await f.ready();await f.key('KeyL');assert.match(f.main,/Pin an item, or add a folder or tag/);assert.match(f.main,/data-action="scope-recent"/);await f.click('scope-recent');assert.equal(cards(f).length,4);
});

test('explicitly retained items stay in My library after their pin is removed',async()=>{
 const f=fixture();await f.ready();f.state.items[1].retainedAt=1000;f.api.emit({items:f.state.items});await f.ready();await f.key('KeyL');assert.deepEqual(cards(f),[f.text1]);assert.doesNotMatch(f.main,/data-action="retain"/);
});

test('all supported Mac languages are offered in Windows Settings',async()=>{
 const f=fixture();await f.ready();await f.api.command('settings');await f.ready();for(const value of ['system','en','tr','es','fr','pt-BR','az','zh-Hans','ja','ko'])assert.match(f.main,new RegExp('<option value="'+value+'"'));
});

test('crop can resize left top and right bottom edges without moving opposite edges',async()=>{
 const f=fixture();await f.ready();await f.key('Space');await f.key('KeyC');await f.pointer('pointerdown',100,40);await f.pointer('pointermove',600,180);await f.pointer('pointerup',600,180);
 await f.pointer('pointerdown',100,100);await f.pointer('pointermove',150,100);await f.pointer('pointerup',150,100);
 await f.pointer('pointerdown',350,40);await f.pointer('pointermove',350,60);await f.pointer('pointerup',350,60);
 await f.pointer('pointerdown',600,120);await f.pointer('pointermove',650,120);await f.pointer('pointerup',650,120);
 await f.pointer('pointerdown',350,180);await f.pointer('pointermove',350,200);await f.pointer('pointerup',350,200);await f.key('Enter');
 assert.deepEqual(f.state.items[0].crop,{x:150,y:60,width:500,height:140});
});

test('crop corners clamp inside original and maintain nonzero size',async()=>{
 const f=fixture();await f.ready();await f.key('Space');await f.key('KeyC');await f.pointer('pointerdown',100,40);await f.pointer('pointermove',600,180);await f.pointer('pointerup',600,180);
 await f.pointer('pointerdown',100,40);await f.pointer('pointermove',650,200);await f.pointer('pointerup',650,200);await f.key('Enter');assert.deepEqual(f.state.items[0].crop,{x:599,y:179,width:1,height:1});
});

test('Reset crop preserves annotations and Clear annotations preserves crop',async()=>{
 const f=fixture();await f.ready();const image=f.state.items[0];image.crop={x:10,y:10,width:500,height:150};image.annotations=[{type:'rectangle',x:40,y:30,width:60,height:60,color:'#ff0000'}];f.api.emit({items:f.state.items});await f.ready();await f.key('Space');await f.key('KeyC');await f.click('reset-crop');await f.click('save-image');assert.equal(image.crop,null);assert.equal(image.annotations.length,1);
 image.crop={x:10,y:10,width:500,height:150};f.api.emit({items:f.state.items});await f.ready();await f.key('KeyM');await f.click('clear-annotations');await f.click('save-image');assert.deepEqual(image.crop,{x:10,y:10,width:500,height:150});assert.deepEqual(image.annotations,[]);
});

test('image crop undo and redo remain available after Done returns to browsing preview',async()=>{
 const f=fixture();await f.ready();await f.key('Space');await f.key('KeyC');await f.pointer('pointerdown',60,30);await f.pointer('pointermove',500,150);await f.pointer('pointerup',500,150);await f.key('Enter');assert.deepEqual(f.state.items[0].crop,{x:60,y:30,width:440,height:120});assert.doesNotMatch(f.overlay,/markup-canvas/);
 await f.key('KeyZ',{ctrl:true});assert.equal(f.state.items[0].crop,null);assert.doesNotMatch(f.overlay,/markup-canvas/);
 await f.key('KeyZ',{ctrl:true,shift:true});assert.deepEqual(f.state.items[0].crop,{x:60,y:30,width:440,height:120});assert.doesNotMatch(f.overlay,/markup-canvas/);
});

test('Library visual search uses only eligible image IDs, combines with text and respects text-only mode',async()=>{
 const f=fixture();await f.ready();f.setVisualSearch(({eligibleIds})=>({ids:[f.image,f.text1],scores:[{id:f.image,score:.4},{id:f.text1,score:99}],available:true,indexing:false}));await recent(f);await f.input('search-input','ocean');assert.deepEqual(cards(f),[f.image]);const request=f.commands.findLast(command=>command.action==='searchImages');assert.deepEqual(request.payload,{query:'ocean',eligibleIds:[f.image]});
 await f.change('search-mode-filter','text');assert.deepEqual(cards(f),[]);await f.input('search-input','Text one');assert.deepEqual(cards(f),[f.text1]);
 await f.change('search-mode-filter','visual');assert.deepEqual(cards(f),[f.image]);await f.click('clear-filters');assert.equal(cards(f).length,4);
});

test('visual query results from an older request cannot replace the current query or cross Library scope',async()=>{
 const f=fixture();await f.ready();let release;const delayed=new Promise(resolve=>{release=resolve;});f.setVisualSearch(({query})=>query==='old query'?delayed:{ids:[],scores:[],available:true,indexing:false});await recent(f);await f.input('search-input','old query');await f.input('search-input','new query');assert.deepEqual(cards(f),[]);release({ids:[f.image],scores:[{id:f.image,score:.5}],available:true,indexing:false});await f.ready();assert.deepEqual(cards(f),[]);
 f.setVisualSearch(()=>({ids:[f.image],scores:[{id:f.image,score:.5}],available:true,indexing:false}));await f.click('scope',{scope:'saved'});await f.input('search-input','ocean');assert.deepEqual(cards(f),[]);assert.deepEqual(f.commands.findLast(command=>command.action==='searchImages').payload.eligibleIds,[]);
});

test('local image index revisions refresh an existing visual query without semantic calls from shelves',async()=>{
 const f=fixture();await f.ready();let indexed=false;f.setVisualSearch(()=>({ids:indexed?[f.image]:[],scores:indexed?[{id:f.image,score:.4}]:[],available:indexed,indexing:!indexed}));await f.key('KeyS',{shift:true});await f.input('search-input','ocean');assert.equal(f.commands.filter(command=>command.action==='searchImages').length,0);await f.key('Escape');await recent(f);await f.input('search-input','ocean');assert.deepEqual(cards(f),[]);assert.match(f.main,/Indexing images locally/);indexed=true;f.api.emit({imageSearch:{available:true,indexing:false,revision:1}});await f.ready();assert.deepEqual(cards(f),[f.image]);assert.equal(f.commands.filter(command=>command.action==='searchImages').length,2);
});

test('Library layout toggles persist and saved column visibility, sizes and view are restored',async()=>{
 const f=fixture();await f.ready();await recent(f);await f.click('view-mode');assert.equal(f.state.settings.libraryListMode,true);await f.click('toggle-inspector');assert.equal(f.state.settings.libraryInspectorVisible,false);await f.click('toggle-sidebar');assert.equal(f.state.settings.librarySidebarVisible,false);
 f.api.emit({settings:{...f.state.settings,libraryListMode:false,libraryInspectorVisible:true,librarySidebarVisible:true,librarySidebarWidth:280,libraryInspectorWidth:370}});await f.ready();assert.match(f.main,/class="sidebar" style="width:280px;flex-basis:280px"/);assert.match(f.main,/class="inspector" style="width:370px;flex-basis:370px"/);assert.doesNotMatch(f.main,/library-grid list/);assert.match(f.main,/data-library-divider="sidebar"/);assert.match(f.main,/data-library-divider="inspector"/);
});

test('inspector automatically saves name text and note without pinning before navigating away',async()=>{
 const f=fixture();await f.ready();await recent(f);await f.key('ArrowRight');await f.input('detail-name','Inspector title without pin');await f.input('detail-text','Edited in Library inspector');await f.input('detail-note','Autosaved organization context');await f.key('ArrowRight');const value=f.state.items.find(value=>value.id===f.text1);assert.equal(value.name,'Inspector title without pin');assert.equal(value.text,'Edited in Library inspector');assert.equal(value.note,'Autosaved organization context');assert.equal(value.pinned,false);assert.ok(f.commands.some(value=>value.action==='details'&&value.payload.id===f.text1));assert.match(f.main,new RegExp('data-item-id="'+f.text2+'"'));
});

test('failed inspector write keeps the draft and aborts navigation until a successful retry',async()=>{
 const f=fixture();await f.ready();await recent(f);await f.key('ArrowRight');f.failDetails(2);await f.input('detail-text','Draft must not disappear');assert.equal(f.state.items.find(value=>value.id===f.text1).text,'Text one');await f.key('ArrowRight');assert.match(f.main,new RegExp('card kind-text focused selected[^>]*data-item-id="'+f.text1+'"'));assert.match(f.main,/Draft must not disappear/);assert.match(f.nodes.get('toast').textContent,/Changes could not be saved/);await f.key('ArrowRight');assert.equal(f.state.items.find(value=>value.id===f.text1).text,'Draft must not disappear');assert.match(f.main,new RegExp('card kind-text focused selected[^>]*data-item-id="'+f.text2+'"'));
});

test('edits made during an in-flight inspector save are not cleared by its older completion',async()=>{
 const f=fixture();await f.ready();await recent(f);await f.key('ArrowRight');const release=f.deferReply('details');await f.input('detail-text','First saved draft');await f.input('detail-text','Newer saved draft');await f.input('detail-note','Newer note');release();await f.ready();assert.equal(f.state.items.find(value=>value.id===f.text1).text,'Newer saved draft');assert.equal(f.state.items.find(value=>value.id===f.text1).note,'Newer note');await f.click('scope',{scope:'saved'});assert.equal(cards(f).length,0);
});

test('Library Title and Added headers toggle matching sorts through real action handlers',async()=>{
 const f=fixture();await f.ready();await recent(f);await f.click('view-mode');await f.click('sort-column',{column:'title'});assert.deepEqual(cards(f),[f.link,f.image,f.text1,f.text2]);assert.match(f.main,/data-action="sort-column" data-column="title" aria-pressed="true"/);await f.click('sort-column',{column:'title'});assert.deepEqual(cards(f),[f.text2,f.text1,f.image,f.link]);await f.click('sort-column',{column:'created'});assert.deepEqual(cards(f),[f.image,f.text1,f.text2,f.link]);await f.click('sort-column',{column:'created'});assert.deepEqual(cards(f),[f.link,f.text2,f.text1,f.image]);
});

test('list column pointer resize clamps to native bounds, persists widths and cancel restores the original',async()=>{
 const f=fixture();await f.ready();await recent(f);await f.click('view-mode');await f.columnDrag('title',300,440);assert.equal(f.state.settings.libraryListColumns.title,440);assert.match(f.main,/--list-title-width:440px/);await f.columnDrag('title',0,-900);assert.equal(f.state.settings.libraryListColumns.title,180);await f.columnDrag('tags',0,10000);assert.equal(f.state.settings.libraryListColumns.tags,800);const before=f.commands.filter(value=>value.action==='setSettings').length;await f.columnDrag('tags',0,-500,true);assert.match(f.main,/--list-tags-width:800px/);assert.equal(f.commands.filter(value=>value.action==='setSettings').length,before);
});

test('list column separator keyboard resize supports arrows Home and End and restores saved columns',async()=>{
 const f=fixture();await f.ready();await recent(f);await f.click('view-mode');const target=f.columnGrip('created');await f.key('ArrowRight',{target});assert.equal(f.state.settings.libraryListColumns.created,140);await f.key('Home',{target});assert.equal(f.state.settings.libraryListColumns.created,100);await f.key('End',{target});assert.equal(f.state.settings.libraryListColumns.created,500);f.api.emit({settings:{...f.state.settings,libraryListColumns:{title:375,kind:95,tags:210,created:175}}});await f.ready();for(const [key,width]of Object.entries({title:375,kind:95,tags:210,created:175}))assert.match(f.main,new RegExp('--list-'+key+'-width:'+width+'px'));assert.match(f.main,/data-list-column="created"[^>]*aria-valuenow="175"/);
});

test('default text drag preserves combined text insertion while Alt drag requests ordered separate file copies',async()=>{
 const f=fixture();await f.ready();await f.key('ArrowDown');await f.key('KeyA',{ctrl:true});let drag=await f.drag(f.text1);assert.equal(drag.prevented,undefined);assert.equal(drag.data.get('text/plain'),'Text one\n\nText two');assert.equal(drag.effectAllowed,'copy');assert.equal(f.commands.filter(value=>value.action==='startDrag').length,0);assert.match(f.main,/Drag to insert text · Alt\+drag to export file copies/);
 drag=await f.drag(f.text1,{alt:true});assert.equal(drag.prevented,true);assert.equal(f.commands.at(-1).action,'startDrag');assert.deepEqual(f.commands.at(-1).payload.ids,[f.text1,f.text2]);assert.equal(drag.data.get('text/plain'),'Text one\n\nText two');
 await f.key('ArrowDown');drag=await f.drag(f.link);assert.equal(drag.prevented,undefined);assert.equal(drag.data.get('text/plain'),'https://example.com/reference');await f.drag(f.link,{alt:true});assert.deepEqual(f.commands.at(-1).payload.ids,[f.link]);
});

test('after editing text column one, Up previews image column one and explicit First moves to the first image',async()=>{
 const f=fixture();await f.ready();const newer='00000000-0000-4000-8000-000000000005';f.state.items.push({...structuredClone(f.state.items[0]),id:newer,createdAt:2000,name:'New first image',mediaUrl:'appmedia://media/'+newer,originalMediaUrl:'appmedia://media/'+newer+'/original'});f.api.emit({items:f.state.items});await f.ready();await f.api.command('hide');await f.api.command('show');await f.ready();await f.key('ArrowDown');await f.key('ArrowRight');await f.key('Space');await f.key('KeyE');await f.input('text-editor','Edited second column text');await f.key('Enter',{ctrl:true});await f.key('ArrowUp');assert.match(f.overlay,/aria-label="Synthetic image"/);assert.match(f.main,new RegExp('card kind-image focused selected[^>]*data-item-id="'+f.image+'"'));await f.key('ArrowLeft',{ctrl:true});assert.match(f.overlay,/aria-label="New first image"/);assert.match(f.main,new RegExp('card kind-image focused selected[^>]*data-item-id="'+newer+'"'));
});

test('multiple crop gestures commit as one applied document for browsing undo and redo',async()=>{
 const f=fixture();await f.ready();await f.key('Space');await f.key('KeyC');await f.pointer('pointerdown',100,40);await f.pointer('pointermove',600,180);await f.pointer('pointerup',600,180);await f.pointer('pointerdown',100,110);await f.pointer('pointermove',150,110);await f.pointer('pointerup',150,110);await f.pointer('pointerdown',375,40);await f.pointer('pointermove',375,60);await f.pointer('pointerup',375,60);await f.key('Enter');const applied={x:150,y:60,width:450,height:120};assert.deepEqual(f.state.items[0].crop,applied);await f.key('KeyZ',{ctrl:true});assert.equal(f.state.items[0].crop,null);await f.key('KeyZ',{ctrl:true,shift:true});assert.deepEqual(f.state.items[0].crop,applied);
});

test('canceling multiple crop gestures restores the previous markup undo history',async()=>{
 const f=fixture();await f.ready();await f.key('Space');await f.key('KeyM');await f.key('KeyR');await f.pointer('pointerdown',50,40);await f.pointer('pointermove',130,100);await f.pointer('pointerup',130,100);await f.key('KeyC');await f.pointer('pointerdown',100,40);await f.pointer('pointermove',600,180);await f.pointer('pointerup',600,180);await f.pointer('pointerdown',100,110);await f.pointer('pointermove',150,110);await f.pointer('pointerup',150,110);await f.key('Escape');await f.key('KeyZ',{ctrl:true});await f.click('save-image');assert.equal(f.state.items[0].crop,null);assert.deepEqual(f.state.items[0].annotations,[]);
});

test('failed crop apply retries do not duplicate the crop undo transaction',async()=>{
 const f=fixture();await f.ready();await f.key('Space');await f.key('KeyC');await f.pointer('pointerdown',60,30);await f.pointer('pointermove',500,150);await f.pointer('pointerup',500,150);f.failExportOnce();await f.key('Enter');assert.match(f.overlay,/markup-canvas/);await f.key('Enter');assert.deepEqual(f.state.items[0].crop,{x:60,y:30,width:440,height:120});await f.key('KeyZ',{ctrl:true});assert.equal(f.state.items[0].crop,null);const saved=f.commands.filter(value=>value.action==='saveImage').length;await f.key('KeyZ',{ctrl:true});assert.equal(f.commands.filter(value=>value.action==='saveImage').length,saved,'A failed apply must not leave another crop checkpoint');
});
