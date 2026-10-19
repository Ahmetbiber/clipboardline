'use strict';

// Windows' native multi-file clipboard cannot carry a web custom format, so
// its registered marker must be recognized before asynchronously reading the
// image. The OS clipboard monitor can observe it before the writer returns.
function privateClipboard(formats){
  return formats.some(format=>/concealed|password|agilebits|ExcludeClipboardContentFromMonitorProcessing|ClipBoardLine\.Internal\.v1/i.test(format));
}
module.exports={privateClipboard};
