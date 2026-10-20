'use strict';
const assert=require('node:assert/strict');

module.exports=async({page,application,check,until})=>{
 const fixture=await application.evaluate(async({nativeImage})=>{
  const h=global.__clipboardLineTest,crypto=process.getBuiltinModule('node:crypto'),prefix='Folder drag '+crypto.randomUUID(),bitmap=crypto.randomBytes(16);for(let at=3;at<bitmap.length;at+=4)bitmap[at]=255;
  const image=h.store.insert('image',nativeImage.createFromBitmap(bitmap,{width:2,height:2}).toPNG()),text=h.store.insert('text',prefix+' text value'),a=h.store.modify('createFolder',{name:prefix+' A'}),b=h.store.modify('createFolder',{name:prefix+' B'});
  for(const [item,suffix]of [[image,' image'],[text,' text']]){h.store.modify('details',{id:item.id,name:prefix+suffix});h.store.modify('retain',{ids:[item.id]});}
  h.store.modify('folder',{ids:[image.id],folderId:a.id,pinning:false});
  const originalSidebar=h.store.data.settings.librarySidebarVisible;
  await h.command('setSettings',{patch:{librarySidebarVisible:true}});await h.command('library');
  return{prefix,image:image.id,text:text.id,a:a.id,b:b.id,originalSidebar};
 });
 try{
  await page.locator('[data-action="scope"][data-scope="saved"]').click();
  const clear=page.locator('[data-action="clear-filters"]').first();if(await clear.count()&&await clear.isVisible())await clear.click();
  await page.locator('[data-action="allTypes"]').click();await page.locator('#search-input').fill(fixture.prefix);
  const image=page.locator(`.library-grid [data-item-id="${fixture.image}"]`),text=page.locator(`.library-grid [data-item-id="${fixture.text}"]`);
  await image.waitFor({state:'visible'});await text.waitFor({state:'visible'});
  await image.dragTo(page.locator(`[data-action="folder-scope"][data-folder="${fixture.b}"]`));
  const read=()=>application.evaluate((_electron,{image,text})=>{const h=global.__clipboardLineTest;return{image:h.store.item(image),text:h.store.item(text)};},fixture);
  let state=await until(read,value=>value.image.folderIds.includes(fixture.b));assert.deepEqual(state.image.folderIds,[fixture.a,fixture.b]);assert.equal(state.image.pinned,false);assert.deepEqual(state.text.folderIds,[]);
  await image.click();await text.click({modifiers:['Control']});await until(()=>page.locator('.library-grid .card.selected').count(),value=>value===2);
  await text.dragTo(page.locator(`[data-action="folder-scope"][data-folder="${fixture.a}"]`));
  state=await until(read,value=>value.text.folderIds.includes(fixture.a));assert.deepEqual(state.image.folderIds,[fixture.a,fixture.b]);assert.deepEqual(state.text.folderIds,[fixture.a]);assert.equal(state.image.pinned,false);assert.equal(state.text.pinned,false);
  check('actual Library image and mixed-selection DOM drags add folder memberships without moving, pinning or losing existing membership');
 }finally{
  if(await page.locator('#search-input').count())await page.locator('#search-input').fill('').catch(()=>{});
  await application.evaluate(async(_electron,value)=>{const h=global.__clipboardLineTest;for(const id of [value.image,value.text]){h.store.modify('trash',{ids:[id]});h.store.modify('delete',{ids:[id]});}for(const id of [value.a,value.b])h.store.modify('removeFolder',{id});await h.command('setSettings',{patch:{librarySidebarVisible:value.originalSidebar}});await h.command('hide');},fixture);
 }
};
