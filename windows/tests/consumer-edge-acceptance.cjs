'use strict';
const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');
const {chromium}=require('playwright');

async function browserConsumer({page,application,textItem,imageItem,check,until,report,output},name,vendor,relative){
  const roots=[process.env['ProgramFiles(x86)'],process.env.ProgramFiles,process.env.LOCALAPPDATA].filter(Boolean);
  const executable=roots.map(root=>path.join(root,...relative)).find(file=>fs.existsSync(file));
  report.consumers??={};const consumer=report.consumers[name]={available:!!executable,passed:false};
  if(!executable)throw new Error(vendor+' is not installed; actual consumer-browser acceptance cannot run.');
  await page.evaluate(()=>window.clipboardLine.command('hide'));
  const browser=await chromium.launch({executablePath:executable,headless:false,args:['--force-renderer-accessibility','--no-first-run','--disable-background-networking','--disable-component-update','--disable-sync']});
  let target;
  const domFocus=()=>target.evaluate(()=>{const element=document.activeElement;return{documentFocused:document.hasFocus(),activeTag:element?.tagName||'',activeRole:element?.getAttribute('role')||'',activeID:element?.id||'',isContentEditable:!!element?.isContentEditable,enabled:!element?.disabled,secure:element?.type==='password'};});
  const nativeFocus=()=>application.evaluate(async()=>{const native=global.__clipboardLineTest.native;return native.captureDiagnostics?await native.captureDiagnostics():await native.capture();});
  try{
    consumer.version=browser.version();
    target=await browser.newPage({viewport:{width:1100,height:700}});
    await target.goto('data:text/html,'+encodeURIComponent('<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; img-src data: blob:"><title>ClipBoardLine synthetic browser paste fixture</title><style>body{font:20px sans-serif;margin:30px}.rich{border:2px solid #777;min-height:50px;margin:12px 0;padding:12px}#editor{min-height:150px}input{display:block;margin-top:14px;padding:10px}</style><h1>Local consumer-browser paste fixture</h1><div id="editor" class="rich" contenteditable="true" role="textbox" aria-label="Synthetic rich editor"></div><div id="alternate" class="rich" contenteditable="true" role="textbox" aria-label="Synthetic alternate editor">Alternate untouched</div><input id="readonly" readonly value="Read-only untouched" aria-label="Synthetic read-only field"><input id="password" type="password" aria-label="Synthetic password field">'));
    await target.bringToFront();await target.locator('#editor').fill('Original browser fixture selection');await target.locator('#editor').press('Control+a');
    consumer.beforeShow={dom:await domFocus()};
    await application.evaluate(()=>global.__clipboardLineTest.command('show'));
    const captured=await application.evaluate(()=>global.__clipboardLineTest.getTarget());consumer.captured=captured;
    if(!captured?.editable||captured?.secure){
      // Diagnose only after the real first capture failed. A preflight UIA read
      // could warm a lazy provider and hide a cold-capture production failure.
      await page.evaluate(()=>window.clipboardLine.command('hide'));await target.bringToFront();
      consumer.failedTargetDiagnostics={dom:await domFocus(),native:await nativeFocus()};
    }
    assert.ok(captured?.editable&&!captured?.secure,vendor+' editable UIA target: '+JSON.stringify({captured,beforeShow:consumer.beforeShow,diagnostics:consumer.failedTargetDiagnostics}));
    await page.locator(`[data-shelf="text"] [data-item-id="${textItem.id}"]`).click({modifiers:['Control']});await page.keyboard.press('Control+Enter');
    await until(()=>target.locator('#editor').innerText(),value=>value===textItem.text);assert.equal((await page.evaluate(()=>window.clipboardLine.state())).windowVisible,false);
    consumer.textPaste=true;const returnedTextFocus=await application.evaluate(()=>global.__clipboardLineTest.native.capture());assert.equal(returnedTextFocus.processId,captured.processId);assert.equal(returnedTextFocus.handle,captured.handle);assert.ok(returnedTextFocus.editable&&!returnedTextFocus.secure);assert.equal(await target.locator('#editor').evaluate(element=>element===document.activeElement),true);check('actual '+vendor+' contenteditable accepts native CtrlEnter text replacement and regains native focus');

    await target.bringToFront();await target.locator('#editor').click();await target.locator('#editor').press('Control+a');await target.locator('#editor').press('Backspace');
    await application.evaluate(()=>global.__clipboardLineTest.command('library'));
    await page.locator(`[data-item-id="${imageItem.id}"]`).click();await page.keyboard.press('Space');await page.locator('#preview-dialog').waitFor({state:'visible'});await page.keyboard.press('Control+Enter');
    await target.locator('#editor img').first().waitFor({state:'visible'});const image=await until(()=>target.locator('#editor img').first().evaluate(element=>({complete:element.complete,width:element.naturalWidth,height:element.naturalHeight})),value=>value.complete&&value.width>0&&value.height>0);
    assert.equal((await page.evaluate(()=>window.clipboardLine.state())).windowVisible,false);consumer.imagePaste=image;const returnedImageFocus=await application.evaluate(()=>global.__clipboardLineTest.native.capture());assert.equal(returnedImageFocus.processId,captured.processId);assert.equal(returnedImageFocus.handle,captured.handle);assert.ok(returnedImageFocus.editable&&!returnedImageFocus.secure);assert.equal(await target.locator('#editor').evaluate(element=>element===document.activeElement),true);check('actual '+vendor+' contenteditable accepts native Library preview image paste and regains native focus');

    // Pause exactly before production validation, then move focus to a second
    // real editor in the same browser. A generic window/pane identity cannot
    // satisfy this: the destination must identify the captured editable field.
    await target.bringToFront();await target.locator('#editor').fill('Original field before canceled paste');await target.locator('#editor').press('Control+a');
    await application.evaluate(()=>global.__clipboardLineTest.command('show'));
    const originalTarget=await application.evaluate(()=>global.__clipboardLineTest.getTarget());assert.ok(originalTarget?.editable&&!originalTarget.secure,JSON.stringify(originalTarget));
    const fields=()=>target.evaluate(()=>({first:document.getElementById('editor').innerHTML,second:document.getElementById('alternate').innerHTML,readonly:document.getElementById('readonly').value,passwordLength:document.getElementById('password').value.length}));
    const beforeChanged=await fields();await application.evaluate(async({clipboard})=>await clipboard.writeText('Clipboard before browser field change'));
    await application.evaluate(()=>{const native=global.__clipboardLineTest.native;let release;const gate=new Promise(resolve=>{release=resolve;});global.__consumerChangedPaste={original:native.validatePaste,release,waiting:false};native.validatePaste=async target=>{global.__consumerChangedPaste.waiting=true;await gate;return global.__consumerChangedPaste.original(target);};});
    const changedRequest=page.evaluate(id=>window.clipboardLine.command('paste',{ids:[id]}),textItem.id);
    try{
      await until(()=>application.evaluate(()=>global.__consumerChangedPaste.waiting),Boolean);
      await target.bringToFront();await target.locator('#alternate').click();
      const changedTarget=await application.evaluate(()=>global.__clipboardLineTest.native.capture());assert.ok(changedTarget?.editable&&!changedTarget.secure,JSON.stringify(changedTarget));assert.equal(changedTarget.handle,originalTarget.handle);assert.equal(changedTarget.processId,originalTarget.processId);assert.notEqual(changedTarget.runtime,originalTarget.runtime,'Separate browser editors require distinct stable native focus identities');
      consumer.fieldIdentities={first:originalTarget.runtime,second:changedTarget.runtime};
      await application.evaluate(()=>global.__consumerChangedPaste.release());const canceled=await changedRequest;assert.ok(canceled.result?.error,JSON.stringify(canceled.result));
      assert.equal(await application.evaluate(async({clipboard})=>await clipboard.readText()),'Clipboard before browser field change');assert.deepEqual(await fields(),beforeChanged);consumer.changedFieldRejected=true;
      check('actual '+vendor+' changed-field paste cancels before clipboard replacement or insertion into either editor');
    }finally{await application.evaluate(()=>{const pending=global.__consumerChangedPaste;if(pending){pending.release();global.__clipboardLineTest.native.validatePaste=pending.original;delete global.__consumerChangedPaste;}});await changedRequest.catch(()=>{});}
    await page.evaluate(()=>window.clipboardLine.command('hide'));

    for(const control of ['readonly','password']){
      await target.bringToFront();await target.locator('#'+control).click();await application.evaluate(()=>global.__clipboardLineTest.command('show'));
      const guarded=await application.evaluate(()=>global.__clipboardLineTest.getTarget());assert.ok(control==='password'?guarded?.secure===true:guarded?.editable===false&&!guarded?.secure,vendor+' '+control+' native target: '+JSON.stringify(guarded));
      const beforeFields=await fields(),sentinel='Clipboard before browser '+control+' rejection';await page.locator(`[data-shelf="text"] [data-item-id="${textItem.id}"]`).click({modifiers:['Control']});await application.evaluate(async({clipboard},text)=>await clipboard.writeText(text),sentinel);
      const blocked=await page.evaluate(id=>window.clipboardLine.command('paste',{ids:[id]}),textItem.id);assert.ok(blocked.result?.error);assert.deepEqual(await fields(),beforeFields);assert.equal(await application.evaluate(async({clipboard})=>await clipboard.readText()),sentinel);
      consumer[control==='password'?'passwordRejected':'readOnlyRejected']=true;check('actual '+vendor+' '+control+' target rejects paste without clipboard replacement or changing any editor');await page.evaluate(()=>window.clipboardLine.command('hide'));
    }
    consumer.passed=true;
  }catch(error){
    consumer.failure={error:String(error.stack||error),dom:target&&!target.isClosed()?await domFocus().catch(()=>null):null,native:await nativeFocus().catch(nativeError=>({error:nativeError.message}))};
    if(output&&target&&!target.isClosed())await target.screenshot({path:path.join(output,name+'-consumer-failure.png')}).catch(()=>{});
    console.error(vendor+' consumer failure diagnostics: '+JSON.stringify(consumer.failure));throw error;
  }finally{await browser.close();}
}
module.exports=async options=>{
  await browserConsumer(options,'edge','Microsoft Edge',['Microsoft','Edge','Application','msedge.exe']);
  await browserConsumer(options,'chrome','Google Chrome',['Google','Chrome','Application','chrome.exe']);
};
