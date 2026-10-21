'use strict';
const assert=require('node:assert/strict');
// Called with the native three-row fixture after its real index is idle. All
// samples come from presented transforms in the shipped renderer, not a model.
module.exports=async function shelfMotionAcceptance({page,application,until,firstImage}){
 const evidence={};
 await page.emulateMedia({reducedMotion:'no-preference'});
 await application.evaluate(()=>{const h=global.__clipboardLineTest,w=h.getWindow(),original={projection:h.store.publicState,bounds:w.setBounds,hide:w.hide,restore:h.native.restore};const value={original,projections:0,boundsChanges:0,hides:[],restores:0};h.store.publicState=function(...args){value.projections++;return original.projection.apply(this,args);};w.setBounds=function(...args){value.boundsChanges++;return original.bounds.apply(this,args);};w.hide=function(...args){value.hides.push(Date.now());return original.hide.apply(this,args);};h.native.restore=function(...args){value.restores++;return original.restore.apply(this,args);};global.__shelfMotionAcceptance=value;});
 await page.evaluate(()=>{
  const body=document.body,original=body.animate,nodes=Array.from(document.querySelectorAll('.shelf,.shelves .card,.shelves img')),value={original,nodes,events:[],samples:[],running:true};
  body.animate=function(...args){const animation=original.apply(this,args),event={phase:body.dataset.shelfMotion,at:Date.now(),duration:args[1].duration,finishedAt:null,canceled:false};value.events.push(event);animation.finished.then(()=>event.finishedAt=Date.now(),()=>event.canceled=true);return animation;};
  const sample=()=>{if(!value.running)return;const phase=body.dataset.shelfMotion,transform=getComputedStyle(body).transform;value.samples.push({at:Date.now(),phase:phase||'shown',y:transform==='none'?0:new DOMMatrixReadOnly(transform).m42,height:innerHeight,pointer:getComputedStyle(document.querySelector('.shelves .card')||body).pointerEvents});requestAnimationFrame(sample);};requestAnimationFrame(sample);window.__shelfMotionAcceptance=value;
 });
 try{
  await application.evaluate(()=>global.__clipboardLineTest.command('hide'));
  await page.evaluate(()=>{window.__shelfMotionAcceptance.events=[];window.__shelfMotionAcceptance.samples=[];window.__shelfMotionOpening=window.clipboardLine.command('show');});
  await until(()=>page.evaluate(()=>document.body.dataset.shelfMotion),value=>value==='opening');
  // Ordinary keyboard navigation works before the opening pixels settle.
  await page.keyboard.press('ArrowRight');
  const during=await page.locator('.shelves .card.focused').getAttribute('data-item-id');assert.notEqual(during,firstImage);
  await page.evaluate(()=>window.__shelfMotionOpening);
  evidence.opening=await page.evaluate(()=>{const v=window.__shelfMotionAcceptance,e=v.events.find(e=>e.phase==='opening');return{samples:v.samples.filter(s=>s.phase==='opening'),finished:!!e?.finishedAt,duration:e?.duration,pointerEnabled:getComputedStyle(document.querySelector('.shelves .card')).pointerEvents!=='none'};});
  Object.assign(evidence.opening,await application.evaluate(()=>{const w=global.__clipboardLineTest.getWindow();return{visible:w.isVisible(),focused:w.isFocused()};}));
  assert.equal(evidence.opening.duration,420);assert.equal(evidence.opening.finished,true);assert.equal(evidence.opening.visible,true);assert.equal(evidence.opening.focused,true);assert.equal(evidence.opening.pointerEnabled,true);assert.ok(evidence.opening.samples.length>=2,JSON.stringify(evidence.opening));assert.ok(evidence.opening.samples.every(s=>s.pointer==='none'));assert.ok(evidence.opening.samples.some(s=>s.y< -s.height*.1));assert.ok(evidence.opening.samples.at(-1).y>evidence.opening.samples[0].y+20);
  await page.evaluate(()=>{window.__shelfMotionAcceptance.events=[];window.__shelfMotionAcceptance.samples=[];});
  const closeStart=await application.evaluate(()=>{const v=global.__shelfMotionAcceptance;v.hides=[];return Date.now();});
  await application.evaluate(()=>global.__clipboardLineTest.command('hide'));
  evidence.closing=await page.evaluate(()=>{const v=window.__shelfMotionAcceptance,e=v.events.find(e=>e.phase==='closing');return{samples:v.samples.filter(s=>s.phase==='closing'),finishedAt:e?.finishedAt,duration:e?.duration};});
  const closed=await application.evaluate(()=>({hidden:!global.__clipboardLineTest.getWindow().isVisible(),hides:global.__shelfMotionAcceptance.hides}));
  evidence.closing.hiddenOnlyAfterEnd=closed.hidden&&closed.hides.length===1&&!!evidence.closing.finishedAt&&closed.hides[0]>=evidence.closing.finishedAt;assert.equal(evidence.closing.duration,220);assert.equal(evidence.closing.hiddenOnlyAfterEnd,true,JSON.stringify({closed,closing:evidence.closing,closeStart}));assert.ok(evidence.closing.samples.length>=2);assert.ok(evidence.closing.samples.every(s=>s.pointer==='none'));assert.ok(evidence.closing.samples.at(-1).y<evidence.closing.samples[0].y-20);assert.ok(evidence.closing.samples.some(s=>s.y< -s.height*.3));
  // Reverse a real close after its first moving frame. Do not await that close:
  // doing so would test a completed hide instead of the stale callback race.
  await application.evaluate(()=>global.__clipboardLineTest.command('show'));
  await application.evaluate(()=>{const v=global.__shelfMotionAcceptance;v.hides=[];v.restores=0;global.__shelfMotionClosing=global.__clipboardLineTest.command('hide');});
  await until(()=>page.evaluate(()=>document.body.dataset.shelfMotion),phase=>phase==='closing');
  await application.evaluate(async()=>{const h=global.__clipboardLineTest;await h.command('show');await global.__shelfMotionClosing;});
  await page.waitForTimeout(300);
  evidence.rapidReopen=await application.evaluate(()=>{const w=global.__clipboardLineTest.getWindow(),v=global.__shelfMotionAcceptance;return{visible:w.isVisible(),focused:w.isFocused(),staleHides:v.hides.length,staleRestores:v.restores};});
  const selected=await page.locator('.shelves .card.selected').evaluateAll(nodes=>nodes.map(node=>node.dataset.itemId));evidence.rapidReopen.selectedFirstImage=selected.length===1&&selected[0]===firstImage;assert.deepEqual(evidence.rapidReopen,{visible:true,focused:true,staleHides:0,staleRestores:0,selectedFirstImage:true});
  // Reverse an opening before it finishes, then wait beyond the old opening's
  // deadline to prove it cannot show the window again or enable pointer hits.
  await application.evaluate(()=>global.__clipboardLineTest.command('hide'));
  await application.evaluate(()=>{global.__shelfMotionOpening=global.__clipboardLineTest.command('show');});
  await until(()=>page.evaluate(()=>document.body.dataset.shelfMotion),phase=>phase==='opening');
  await application.evaluate(async()=>{await global.__clipboardLineTest.command('hide');await global.__shelfMotionOpening;});await page.waitForTimeout(450);
  evidence.rapidClose=await application.evaluate(()=>({hidden:!global.__clipboardLineTest.getWindow().isVisible()}));assert.equal(evidence.rapidClose.hidden,true);
  await application.evaluate(()=>global.__clipboardLineTest.command('show'));
  evidence.rapidClose.burstHidden=await application.evaluate(async()=>{const h=global.__clipboardLineTest,closing=h.command('hide'),reopening=h.command('show'),closingAgain=h.command('hide');await Promise.all([closing,reopening,closingAgain]);return!h.getWindow().isVisible();});assert.equal(evidence.rapidClose.burstHidden,true);
  await page.emulateMedia({reducedMotion:'reduce'});
  const before=await page.evaluate(()=>window.__shelfMotionAcceptance.events.length);
  await application.evaluate(()=>global.__clipboardLineTest.command('show'));
  const shown=await application.evaluate(()=>global.__clipboardLineTest.getWindow().isVisible());
  await application.evaluate(()=>global.__clipboardLineTest.command('hide'));
  evidence.reducedMotion={animationCount:await page.evaluate(before=>window.__shelfMotionAcceptance.events.length-before,before),shown,hidden:await application.evaluate(()=>!global.__clipboardLineTest.getWindow().isVisible())};assert.deepEqual(evidence.reducedMotion,{animationCount:0,shown:true,hidden:true});
  await page.emulateMedia({reducedMotion:'no-preference'});await application.evaluate(()=>global.__clipboardLineTest.command('show'));
  Object.assign(evidence,await application.evaluate(()=>{const v=global.__shelfMotionAcceptance;return{boundsChanges:v.boundsChanges,projections:v.projections};}),{allNodesConnected:await page.evaluate(()=>window.__shelfMotionAcceptance.nodes.every(node=>node.isConnected))});assert.equal(evidence.boundsChanges,0);assert.equal(evidence.projections,0);assert.equal(evidence.allNodesConnected,true);
  return evidence;
 }finally{
  await page.emulateMedia({reducedMotion:null});await page.evaluate(()=>{const v=window.__shelfMotionAcceptance;if(v){v.running=false;document.body.animate=v.original;delete window.__shelfMotionAcceptance;}}).catch(()=>{});
  await application.evaluate(()=>{const h=global.__clipboardLineTest,v=global.__shelfMotionAcceptance;if(v){const w=h.getWindow();h.store.publicState=v.original.projection;w.setBounds=v.original.bounds;w.hide=v.original.hide;h.native.restore=v.original.restore;delete global.__shelfMotionAcceptance;}}).catch(()=>{});
 }
};
