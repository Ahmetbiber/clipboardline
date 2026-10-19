'use strict';
const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');
const {chromium}=require('playwright');

module.exports=async function edgeConsumer({page,application,textItem,imageItem,check,until,report}){
  const roots=[process.env['ProgramFiles(x86)'],process.env.ProgramFiles,process.env.LOCALAPPDATA].filter(Boolean);
  const executable=roots.map(root=>path.join(root,'Microsoft','Edge','Application','msedge.exe')).find(file=>fs.existsSync(file));
  report.consumers??={};report.consumers.edge={available:!!executable,passed:false};
  if(!executable)throw new Error('Microsoft Edge is not installed; actual consumer-browser acceptance cannot run.');
  await page.evaluate(()=>window.clipboardLine.command('hide'));
  const browser=await chromium.launch({executablePath:executable,headless:false,args:['--force-renderer-accessibility','--no-first-run','--disable-background-networking','--disable-component-update','--disable-sync']});
  try{
    report.consumers.edge.version=browser.version();
    const target=await browser.newPage({viewport:{width:1100,height:700}});
    await target.goto('data:text/html,'+encodeURIComponent('<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; img-src data: blob:"><title>ClipBoardLine synthetic Edge paste fixture</title><style>body{font:20px sans-serif;margin:40px}#editor{border:2px solid #777;min-height:240px;padding:20px}input{display:block;margin-top:30px;padding:15px}</style><h1>Local consumer-browser paste fixture</h1><div id="editor" contenteditable="true" role="textbox" aria-label="Synthetic rich editor"></div><input id="password" type="password" aria-label="Synthetic password field">'));
    await target.bringToFront();await target.locator('#editor').fill('Original Edge fixture selection');await target.locator('#editor').press('Control+a');
    await application.evaluate(()=>global.__clipboardLineTest.command('show'));
    const captured=await application.evaluate(()=>global.__clipboardLineTest.getTarget());assert.ok(captured?.editable&&!captured?.secure,'Edge editable UIA target: '+JSON.stringify(captured));
    await page.locator(`[data-shelf="text"] [data-item-id="${textItem.id}"]`).click({modifiers:['Control']});await page.keyboard.press('Control+Enter');
    await until(()=>target.locator('#editor').innerText(),value=>value===textItem.text);assert.equal((await page.evaluate(()=>window.clipboardLine.state())).windowVisible,false);
    report.consumers.edge.textPaste=true;check('actual Microsoft Edge contenteditable accepts native CtrlEnter text replacement');

    await target.bringToFront();await target.locator('#editor').click();await target.locator('#editor').press('Control+a');await target.locator('#editor').press('Backspace');
    await application.evaluate(()=>global.__clipboardLineTest.command('show'));
    await page.locator(`[data-shelf="image"] [data-item-id="${imageItem.id}"]`).click({modifiers:['Control']});await page.keyboard.press('Control+Enter');
    await target.locator('#editor img').first().waitFor({state:'visible'});const image=await until(()=>target.locator('#editor img').first().evaluate(element=>({complete:element.complete,width:element.naturalWidth,height:element.naturalHeight})),value=>value.complete&&value.width>0&&value.height>0);
    assert.equal((await page.evaluate(()=>window.clipboardLine.state())).windowVisible,false);report.consumers.edge.imagePaste=image;check('actual Microsoft Edge contenteditable accepts native CtrlEnter image paste');

    await target.bringToFront();await target.locator('#password').click();await application.evaluate(()=>global.__clipboardLineTest.command('show'));
    const secret=await application.evaluate(()=>global.__clipboardLineTest.getTarget());assert.equal(secret?.secure,true,'Edge password UIA target: '+JSON.stringify(secret));
    await page.locator(`[data-shelf="text"] [data-item-id="${textItem.id}"]`).click({modifiers:['Control']});await application.evaluate(async({clipboard})=>await clipboard.writeText('Clipboard before Edge password rejection'));
    const blocked=await page.evaluate(id=>window.clipboardLine.command('paste',{ids:[id]}),textItem.id);assert.ok(blocked.result?.error);assert.equal(await target.locator('#password').evaluate(element=>element.value.length),0);assert.equal(await application.evaluate(async({clipboard})=>await clipboard.readText()),'Clipboard before Edge password rejection');
    report.consumers.edge.passwordRejected=true;report.consumers.edge.passed=true;check('actual Microsoft Edge password target rejects paste without clipboard replacement');
    await page.evaluate(()=>window.clipboardLine.command('hide'));
  }finally{await browser.close();}
};
