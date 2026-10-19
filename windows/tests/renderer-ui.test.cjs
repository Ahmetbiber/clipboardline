'use strict';
// Runs the actual renderer handlers with a small DOM/IPC fixture. These cases
// validate UI state transitions, not browser layout or native Windows paste.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

function fixture(){
 const listeners=new Map(),nodes=new Map(),commands=[];
 class Element{
  constructor(id=''){this.id=id;this.innerHTML='';this.textContent='';this.dataset={};this.style={};this.className='';this.value='';this.selectionStart=0;this.selectionEnd=0;this.classList={add(){},remove(){}};}
  setAttribute(){}querySelector(){return null;}querySelectorAll(){return [];}focus(){}blur(){}select(){}setSelectionRange(){}scrollIntoView(){}matches(){return false;}closest(){return null;}
 }
 class TextArea extends Element{}
 const document={activeElement:null,getElementById(id){if(!nodes.has(id))nodes.set(id,new Element(id));return nodes.get(id);},querySelector(){return null;},addEventListener(name,listener){if(!listeners.has(name))listeners.set(name,[]);listeners.get(name).push(listener);}};
 const image='00000000-0000-4000-8000-000000000001',text1='00000000-0000-4000-8000-000000000002',text2='00000000-0000-4000-8000-000000000003',link='00000000-0000-4000-8000-000000000004';
 const base=(id,kind,createdAt,extra)=>({id,kind,createdAt,updatedAt:createdAt,name:'',title:'',text:'',url:'',pinned:false,folderIds:[],tags:[],trashedAt:null,hiddenFromShelf:false,...extra});
 const state={items:[base(image,'image',1000,{name:'Synthetic image',mediaUrl:'appmedia://media/'+image,originalMediaUrl:'appmedia://media/'+image+'/original'}),base(text1,'text',900,{text:'Text one'}),base(text2,'text',800,{text:'Text two'}),base(link,'link',700,{url:'https://example.com/reference',title:'Reference link'})],folders:[],settings:{visibleKinds:['image','text','link'],retentionDays:{image:30,text:30,link:30},shortcuts:{toggle:'Control+Alt+Space',search:'Control+Alt+S'},localShortcuts:{},language:'en',theme:'soft',cardSize:'medium'},view:'shelves',version:'1.7.0',windowVisible:true,canUndo:false};
 let subscriber,removed=[],cleanupFailures=0;
 const clone=value=>structuredClone(value);
 const api={state:async()=>clone(state),subscribe(fn){subscriber=fn;return()=>{};},async command(action,payload={}){commands.push({action,payload:clone(payload)});const selected=state.items.filter(item=>(payload.ids||[payload.id]).includes(item.id));
  let cleanupError;if(action==='cleanup'){if(cleanupFailures){cleanupFailures--;cleanupError='Permanent deletion cleanup is still pending.';}else state.needsDeletionCleanup=false;}
  if(action==='pin')selected.forEach(item=>item.pinned=typeof payload.value==='boolean'?payload.value:!item.pinned);
  if(action==='name')selected.forEach(item=>{item.name=payload.name;item.pinned=true;});
  if(action==='remove'){removed=selected.map(clone);selected.forEach(item=>{if(item.pinned)item.hiddenFromShelf=true;else item.trashedAt=Date.now();});state.canUndo=true;}
  if(action==='undo'){for(const before of removed)Object.assign(state.items.find(item=>item.id===before.id),before);state.canUndo=false;}
  if(action==='copy'&&!payload.keepOpen||action==='paste'||action==='hide')state.windowVisible=false;
  if(action==='show'){state.view='shelves';state.windowVisible=true;state.viewEvent={serial:String(commands.length)};}
  if(action==='library'||action==='settings'){state.view=action;state.windowVisible=true;}
  const output=clone(state);if(cleanupError)output.result={error:cleanupError};subscriber?.(output);return output;
 }};
 const context={window:{clipboardLine:api,addEventListener(){}},document,HTMLElement:Element,HTMLTextAreaElement:TextArea,Image:Element,console,structuredClone,URL,Set,Date,JSON,Math,Number,String,requestAnimationFrame:fn=>fn(),setTimeout:fn=>{queueMicrotask(fn);return 1;},clearTimeout(){}};
 vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(__dirname,'../renderer.js'),'utf8'),context,{filename:'renderer.js'});
 async function ready(){await new Promise(setImmediate);}
 async function key(code,{ctrl=false,alt=false,shift=false,key}={}){const event={code,key:key||(/^Key/.test(code)?code.slice(3).toLowerCase():code==='Space'?' ':code),ctrlKey:ctrl,metaKey:false,altKey:alt,shiftKey:shift,repeat:false,target:new Element(),preventDefault(){this.prevented=true;}};for(const listener of listeners.get('keydown')||[])await listener(event);await ready();return event;}
 async function click(action){const target=new Element();target.dataset.action=action;target.closest=selector=>selector==='[data-action]'?target:null;for(const listener of listeners.get('click')||[])listener({target,stopPropagation(){}});await ready();}
 async function input(id,value){const target=document.getElementById(id);target.value=value;target.selectionStart=value.length;for(const listener of listeners.get('input')||[])await listener({target});await ready();}
 return{ready,key,input,click,failCleanupOnce(){cleanupFailures++;},state,commands,nodes,image,text1,text2,link,api,get main(){return nodes.get('app').innerHTML;},get overlay(){return nodes.get('overlay-root').innerHTML;}};
}

test('fresh shelves select the first item; P pins it; Space previews it',async()=>{const f=fixture();await f.ready();assert.match(f.main,/card kind-image focused selected/);await f.key('KeyP');assert.equal(f.state.items[0].pinned,true);await f.key('Space');assert.match(f.overlay,/id="preview-dialog"/);assert.match(f.overlay,/aria-label="Synthetic image"/);});

test('preview arrows move across shelf kinds, S keeps preview on neighbor, Backspace restores',async()=>{const f=fixture();await f.ready();await f.key('Space');await f.key('ArrowDown');assert.match(f.overlay,/aria-label="Text one"/);await f.key('KeyS');assert.match(f.overlay,/aria-label="Text two"/);assert.ok(f.state.items.find(item=>item.id===f.text1).trashedAt);await f.key('Backspace');assert.match(f.overlay,/aria-label="Text one"/);assert.equal(f.state.items.find(item=>item.id===f.text1).trashedAt,null);});

test('preview CtrlC keeps open; Enter copies exact current item and dismisses',async()=>{const f=fixture();await f.ready();await f.key('Space');await f.key('ArrowDown');await f.key('KeyC',{ctrl:true});assert.equal(f.commands.at(-1).action,'copy');assert.equal(f.commands.at(-1).payload.keepOpen,true);assert.match(f.overlay,/id="preview-dialog"/);await f.key('Enter');assert.equal(f.commands.at(-1).payload.ids[0],f.text1);assert.equal(f.commands.at(-1).payload.keepOpen,false);assert.equal(f.state.windowVisible,false);assert.equal(f.overlay,'');});

test('L opens Library; CtrlK action search closes with Escape',async()=>{const f=fixture();await f.ready();await f.key('KeyL');assert.equal(f.state.view,'library');assert.match(f.main,/Library results/);await f.key('KeyK',{ctrl:true});assert.match(f.overlay,/Search actions/);await f.key('Escape');assert.equal(f.overlay,'');});

test('AltP sequential naming saves one then advances and Escape leaves remaining item unchanged',async()=>{const f=fixture();await f.ready();await f.key('Tab');await f.key('KeyA',{ctrl:true});await f.key('KeyP',{alt:true});assert.match(f.overlay,/1 \/ 2/);await f.input('name-input','First named note');await f.key('Enter');assert.equal(f.state.items.find(item=>item.id===f.text1).name,'First named note');assert.equal(f.state.items.find(item=>item.id===f.text1).pinned,true);assert.match(f.overlay,/2 \/ 2/);await f.key('Escape');assert.equal(f.state.items.find(item=>item.id===f.text2).name,'');assert.equal(f.state.items.find(item=>item.id===f.text2).pinned,false);});

test('ShiftS searches enabled rows and native show reselects first item',async()=>{const f=fixture();await f.ready();await f.key('KeyS',{shift:true});await f.input('search-input','Text two');assert.match(f.main,/Text two/);assert.doesNotMatch(f.main,/Text one/);await f.key('Escape');await f.key('Tab');await f.key('ArrowRight');assert.match(f.main,/card kind-text focused selected[^>]*data-item-id="00000000-0000-4000-8000-000000000003"/);await f.key('Enter');await f.api.command('show');await f.ready();assert.match(f.main,/card kind-text focused selected[^>]*data-item-id="00000000-0000-4000-8000-000000000002"/);});


test('Settings retries pending deletion cleanup without clearing failure or deleting another record',async()=>{const f=fixture();await f.ready();await f.api.command('settings');await f.ready();assert.doesNotMatch(f.main,/data-action="retry-cleanup"/);const original=f.state.items.map(item=>item.id);f.state.needsDeletionCleanup=true;await f.api.command('settings');await f.ready();assert.match(f.main,/data-action="retry-cleanup"/);f.failCleanupOnce();await f.click('retry-cleanup');assert.equal(f.commands.at(-1).action,'cleanup');assert.deepEqual(f.commands.at(-1).payload,{});assert.equal(f.state.needsDeletionCleanup,true);assert.match(f.main,/data-action="retry-cleanup"/);assert.deepEqual(f.state.items.map(item=>item.id),original);await f.click('retry-cleanup');assert.equal(f.state.needsDeletionCleanup,false);assert.doesNotMatch(f.main,/data-action="retry-cleanup"/);assert.deepEqual(f.state.items.map(item=>item.id),original);});
