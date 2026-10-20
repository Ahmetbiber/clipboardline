'use strict';

// These acceptance fixtures have an opaque original. A visible editor canvas
// initially exists before its asynchronous original PNG has decoded or drawn.
// Dimensions alone can also match a still-empty canvas, so check a real pixel.
function imageEditorRasterReady({width,height}){
 const canvas=document.getElementById('markup-canvas');
 if(!canvas||!canvas.isConnected||canvas.width!==width||canvas.height!==height)return false;
 try{return canvas.getContext('2d').getImageData(0,0,1,1).data[3]===255;}
 catch{return false;}
}

async function waitForImageEditorRaster(page,raster){
 const loaded=await page.waitForFunction(imageEditorRasterReady,raster);
 await loaded.dispose();
}

module.exports={imageEditorRasterReady,waitForImageEditorRaster};
