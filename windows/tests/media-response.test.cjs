'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {mediaResponse,byteRange}=require('../lib/media-response.cjs');
test('managed video responses stream exact ranges for playback and seeking',async()=>{
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'clipboardline-ranges-'));const file=path.join(folder,'synthetic.mp4');fs.writeFileSync(file,'0123456789');
 try{
  for(const [range,status,body,contentRange]of [[null,200,'0123456789',null],['bytes=2-5',206,'2345','bytes 2-5/10'],['bytes=7-',206,'789','bytes 7-9/10'],['bytes=-3',206,'789','bytes 7-9/10'],['bytes=8-100',206,'89','bytes 8-9/10']]){
   const result=mediaResponse(file,{mime:'video/mp4',origin:'file://',range});assert.equal(result.status,status);assert.equal(await result.text(),body);assert.equal(result.headers.get('content-range'),contentRange);assert.equal(result.headers.get('content-length'),String(body.length));assert.equal(result.headers.get('access-control-allow-origin'),'file://');assert.equal(result.headers.get('cache-control'),'no-store');assert.equal(result.headers.get('accept-ranges'),'bytes');
  }
  for(const range of ['bytes=10-','bytes=8-7','bytes=-0','bytes=0-1,4-5','bytes=','bytes=9007199254740992-','other=1-2']){const result=mediaResponse(file,{range});assert.equal(result.status,416);assert.equal(result.headers.get('content-range'),'bytes */10');assert.equal(await result.text(),'');}
 }finally{fs.rmSync(folder,{recursive:true,force:true});}
});
test('media range parsing rejects malformed values and supports bounded suffixes',()=>{
 assert.deepEqual(byteRange('bytes=-100',10),{start:0,end:9,partial:true});assert.equal(byteRange({},10),null);assert.equal(byteRange('bytes='+'1'.repeat(200)+'-',10),null);
});
