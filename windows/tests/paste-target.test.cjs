'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const {PasteTargetTracker}=require('../lib/paste-target.cjs');
const field=(runtime='42.17',extra={})=>({handle:'1002',processId:200,runtime,editable:true,secure:false,...extra});
test('visible-window reentry follows the latest exact external editor without reading its contents',()=>{
  const tracker=new PasteTargetTracker(100);tracker.capture(field());
  tracker.observe(field('42.18',{name:'not retained',value:'not retained',selectedText:'not retained'}));
  tracker.observe(field('90.1',{handle:'1001',processId:100}));
  assert.deepEqual(tracker.reenter(),field('42.18'));assert.ok(Object.isFrozen(tracker.reenter()));
});
test('secure, read-only, missing and malformed external focus cannot reuse the previous editable target',()=>{
  const tracker=new PasteTargetTracker(100);
  for(const target of [field('42.18',{secure:true}),field('42.18',{editable:false}),field(''),null,field('invalid'),field('42.18',{handle:'../1002'}),field('42.18',{processId:-1})]){
    tracker.capture(field());tracker.observe(target);assert.ok(!tracker.reenter()?.editable,JSON.stringify(target));
  }
  tracker.capture(field());tracker.clear();assert.equal(tracker.reenter(),null);
});
test('fresh explicit capture replaces stale state and own events preserve only an already captured external identity',()=>{
  const tracker=new PasteTargetTracker(100);tracker.observe(field('90.1',{processId:100}));assert.equal(tracker.reenter(),null);
  tracker.capture(field());assert.equal(tracker.capture(null),null);tracker.observe(field('90.1',{processId:100}));assert.equal(tracker.reenter(),null);
  tracker.capture(field());assert.deepEqual(tracker.capture(field('90.1',{processId:100})),field());
});

test('canceling a paste terminates its native helpers without interrupting ordinary focus restoration',async()=>{
  const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
  const file=path.resolve(__dirname,'../lib/native.cjs'),requireFrom=require('node:module').createRequire(file),children=[];
  const execFile=(_executable,args,_options,done)=>{
    const child={mode:args.at(-1),killed:false,stdin:{end(){}},kill(){this.killed=true;done(new Error('canceled'),'');}};
    child.complete=()=>done(null,'{"ok":true}');children.push(child);return child;
  };
  const sandbox={module:{exports:{}},__dirname:path.dirname(file),process:{platform:'win32',env:{},pid:100},Buffer,
    require:name=>name==='node:child_process'?{execFile,spawn(){throw new Error('No monitor in this test');}}:requireFrom(name)};
  vm.runInNewContext(fs.readFileSync(file,'utf8'),sandbox,{filename:file});const native=sandbox.module.exports;
  const canceled=[native.preparePaste(field()),native.validatePaste(field()),native.paste(field()),native.copyImages({files:['synthetic.png']})].map(promise=>assert.rejects(promise,/did not respond/));
  const restored=native.restore(field());native.cancelPaste();
  assert.deepEqual(children.map(child=>child.killed),[true,true,true,true,false]);children.at(-1).complete();await restored;await Promise.all(canceled);
});
