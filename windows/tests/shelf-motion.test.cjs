'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {MotionBridge,ShelfMotion}=require('../lib/shelf-motion.cjs');
function fixture(){
 const animations=[],body={style:{},dataset:{},animate(frames,options){let resolve,reject;const animation={frames,options,finished:new Promise((yes,no)=>{resolve=yes;reject=no;}),finish:()=>resolve(),cancel(){this.canceled=true;reject(new Error('Canceled'));}};animations.push(animation);return animation;}},motion={matches:false,addEventListener(_event,listener){this.change=listener;}},controller=new ShelfMotion({body,height:()=>800,computed:()=>({transform:'matrix(1,0,0,1,0,-123)'}),motion});
 return{body,motion,controller,animations};
}
test('native completion accepts only its own current token and phase',async()=>{
 const sent=[],bridge=new MotionBridge(value=>sent.push(value));assert.equal(bridge.acknowledge({completed:true}),false);
 const old=bridge.request('close'),next=bridge.request('open');assert.deepEqual(await old,{completed:false});assert.equal(bridge.acknowledge({...sent[0],completed:true}),false);assert.equal(bridge.acknowledge({...sent[1],phase:'close',completed:true}),false);assert.equal(bridge.acknowledge({...sent[1],completed:true}),true);assert.deepEqual(await next,{completed:true});
});
test('unresponsive renderer has a bounded native completion fallback',async()=>{
 let callback,delay;const bridge=new MotionBridge(()=>{},{schedule:(fn,ms)=>{callback=fn;delay=ms;return 1;},cancel:()=>{}}),operation=bridge.request('close');assert.equal(delay,1220);callback();assert.deepEqual(await operation,{completed:true,timedOut:true});
});
test('opening moves the prepared layer and enables pointer hits only at completion',async()=>{
 const f=fixture();await f.controller.run({phase:'prepare',hidden:true});assert.equal(f.body.style.transform,'translate3d(0,-812px,0)');const opening=f.controller.run({phase:'open'});assert.equal(f.body.dataset.shelfMotion,'opening');assert.equal(f.animations.length,1);assert.equal(f.animations[0].options.duration,420);assert.equal(f.animations[0].options.easing,'cubic-bezier(0.2,1.12,0.3,1)');assert.equal(f.animations[0].frames[0].transform,'translate3d(0,-812px,0)');f.animations[0].finish();assert.deepEqual(await opening,{completed:true});assert.equal(f.body.dataset.shelfMotion,undefined);assert.equal(f.body.style.transform,'translate3d(0,0,0)');assert.equal(f.body.style.willChange,'');
});
test('close reverses the actual presentation and obsolete completion cannot finish reopened layer',async()=>{
 const f=fixture();const closing=f.controller.run({phase:'close'});assert.equal(f.animations[0].options.duration,220);assert.equal(f.animations[0].options.easing,'cubic-bezier(0.4,0,1,1)');await f.controller.run({phase:'prepare',hidden:false});assert.deepEqual(await closing,{completed:false});const opening=f.controller.run({phase:'open'});assert.equal(f.animations[1].frames[0].transform,'matrix(1,0,0,1,0,-123)');f.animations[0].finish();await Promise.resolve();assert.equal(f.body.dataset.shelfMotion,'opening');f.animations[1].finish();await opening;assert.equal(f.body.dataset.shelfMotion,undefined);
});
test('rapid close during opening preserves the current pixels and latest closing state',async()=>{
 const f=fixture();await f.controller.run({phase:'prepare',hidden:true});const opening=f.controller.run({phase:'open'}),closing=f.controller.run({phase:'close'});assert.deepEqual(await opening,{completed:false});assert.equal(f.animations[1].frames[0].transform,'matrix(1,0,0,1,0,-123)');f.animations[1].finish();await closing;assert.equal(f.body.dataset.shelfMotion,'hidden');assert.equal(f.body.style.transform,'translate3d(0,-812px,0)');
});
test('reduced motion creates no animation and reset clears the transform for Library',async()=>{
 const f=fixture();f.motion.matches=true;await f.controller.run({phase:'prepare',hidden:true});await f.controller.run({phase:'open'});assert.equal(f.body.dataset.shelfMotion,undefined);await f.controller.run({phase:'close'});assert.equal(f.body.dataset.shelfMotion,'hidden');await f.controller.run({phase:'reset'});assert.equal(f.animations.length,0);assert.equal(f.body.style.transform,'');assert.equal(f.body.dataset.shelfMotion,undefined);
});
test('changing reduced-motion preference settles the latest active transition immediately',async()=>{
 const f=fixture(),opening=f.controller.run({phase:'open'});f.motion.matches=true;f.motion.change();assert.deepEqual(await opening,{completed:true});assert.equal(f.animations[0].canceled,true);assert.equal(f.body.dataset.shelfMotion,undefined);
});
