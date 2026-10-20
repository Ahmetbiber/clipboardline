'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {imageEditorRasterReady}=require('./image-editor-ready.cjs');

function sample(canvas){
 const context=vm.createContext({document:{getElementById:()=>canvas}});
 return vm.runInContext('('+imageEditorRasterReady.toString()+')({width:96,height:64})',context);
}
function canvas({width=96,height=64,alpha=255,connected=true,fail=false}={}){
 return{width,height,isConnected:connected,getContext:()=>({getImageData(){if(fail)throw new Error('Synthetic unavailable pixels');return{data:new Uint8ClampedArray([223,164,76,alpha])};}})};
}

test('markup acceptance waits for the actual drawn original rather than a visible placeholder canvas',()=>{
 assert.equal(sample(null),false);
 assert.equal(sample(canvas({width:300,height:150})),false);
 assert.equal(sample(canvas({alpha:0})),false);
 assert.equal(sample(canvas({connected:false})),false);
 assert.equal(sample(canvas({fail:true})),false);
 assert.equal(sample(canvas()),true);
});
