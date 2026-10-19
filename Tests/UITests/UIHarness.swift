func XCTUnwrap<T>(_ value:T?) throws -> T {guard let value else {throw HistoryFiles.Failure.unsafeFile};return value}
func XCTAssertTrue(_ value:Bool) {precondition(value,"Synthetic fixture creation failed")}
import AppKit
import SwiftUI

@MainActor final class HarnessClipboard: ClipboardSource {
 var count = 17000
 var values: [[NSPasteboard.PasteboardType: Data]] = [[.string: Data("old synthetic clipboard must not import".utf8)]]
 var changeCount: Int { count }
 var itemTypes: [[NSPasteboard.PasteboardType]] { values.map {Array($0.keys)} }
 func data(forType type: NSPasteboard.PasteboardType,at index:Int)->Data? {values[index][type]}
 func inject(){count += 1; values = [[.string:Data("New synthetic text 👋\n第二行\nmultiline capture".utf8)]]}
 func injectLink(){count += 1; values = [[.string:Data("https://youtu.be/jNQXAC9IVRw?t=20".utf8)]]}
 func injectText(_ text:String){count += 1;values = [[.string:Data(text.utf8)]]}
}
@MainActor final class HarnessDelegate:NSObject,NSApplicationDelegate,NSWindowDelegate {
 var f:SyntheticFixture!
 var line:Line!
 var delegate:AppDelegate!
 var store:LibraryStore!
 let clipboard=HarnessClipboard()
 lazy var dedupWatcher=TextClipboardWatcher(source:clipboard,onText:{[weak self] in self?.delegate.receiveCopiedText($0)},capturesText:{true})
 // Native-copy coverage is explicitly opt-in. Starting the watcher skips the
 // existing general clipboard; only the fixed fixture values reach the store
 // or telemetry. Cua performs the real Cmd-C in this selectable NSTextView.
 let nativeTextVariants:[(String,String)]=[
  ("Raw text","Restoran Listesi Çıkart"),
  ("Trailing LF","Restoran Listesi Çıkart\n"),
  ("Trailing CRLF","Restoran Listesi Çıkart\r\n"),
  ("NFD text","Restoran Listesi Çıkart".decomposedStringWithCanonicalMapping),
  ("Distinct text B","Synthetic native distinct text B")
 ]
 lazy var nativeTextWatcher=TextClipboardWatcher(source:SystemClipboardSource(),onText:{[weak self] in self?.receiveNativeFixtureText($0)},capturesText:{[weak self] in self?.nativeTextCopyWindow?.isVisible == true})
 var nativeTextCopyWindow:NSPanel?
 var nativeTextView:NSTextView?
 var nativeTextVariant="Raw text"
 var nativeTextCaptures=[[String:Any]]()
 let copyBoard=NSPasteboard(name:NSPasteboard.Name("local.clipboardline.library-ui-copy"))
 let mockPasteTargetPID:pid_t=424242
 let mockPasteField=NSObject()
 var mockPasteActivating=false
 var mockPasteRequests=0
 var mockPasteTargetPIDs=[pid_t]()
 var mockPasteText=""
 var lastCopiedText=""
 var copies=0
 var lastCopiedImagePath=""
 var lastCopiedImageSize=[Int]()
 var received=0
 var nativeDragStarts=0
 var nativeDragEnds=0
 var wrappedGrabs=Set<ObjectIdentifier>()
 var pointerEvents:[[String:Any]]=[]
 var pointerMonitor:Any?
 var embeddedReceiver:DropReceiver?
 var receiverEntries=0
 var receiverUpdates=0
 var receiverPreparations=0
 var receivedTypes:[String]=[]
 var controlsWindow:NSPanel?
 var fixtureActions:[() -> Void]=[]
 var markupFixtureID:UUID?
 var pagingFixtureLoaded=false
 var timer:Timer?
 let output=Bundle.main.bundleURL.deletingLastPathComponent().deletingLastPathComponent().appendingPathComponent("local/validation/current")
 func applicationDidFinishLaunching(_ n:Notification){
  do {
   try FileManager.default.createDirectory(at: output, withIntermediateDirectories: true)
   f=try SyntheticFixture(folderRoot: output.appendingPathComponent("fixtures"))
   store=try LibraryStore(defaults:f.defaults,inbox:f.inbox,now:{self.f.date},moveToTrash:fixtureTrash(f.folder))
   line=Line(defaults:f.defaults,inbox:f.inbox,now:{self.f.date},breeze:false,moveToTrash:fixtureTrash(f.folder),
     copyImage:{url in self.lastCopiedImagePath=url.path;self.lastCopiedImageSize=(try? Data(contentsOf:url)).flatMap{NSBitmapImageRep(data:$0)}.map{[$0.pixelsWide,$0.pixelsHigh]} ?? [];self.copies += 1},copyText:{self.lastCopiedText=$0;self.copies += 1},library:store)
   for i in 0..<14 {
    let url=try f.image(owned:i%3 != 0)
    let rep=NSBitmapImageRep(bitmapDataPlanes:nil,pixelsWide:800,pixelsHigh:500,bitsPerSample:8,samplesPerPixel:4,hasAlpha:true,isPlanar:false,colorSpaceName:.deviceRGB,bytesPerRow:0,bitsPerPixel:0)!
    NSGraphicsContext.saveGraphicsState();NSGraphicsContext.current=NSGraphicsContext(bitmapImageRep:rep)
    NSColor(calibratedHue:CGFloat(i%8)/8,saturation:0.7,brightness:0.65,alpha:1).setFill();NSBezierPath(rect:NSRect(x:0,y:0,width:800,height:500)).fill()
    ("Synthetic image \(i)" as NSString).draw(at:NSPoint(x:80,y:200),withAttributes:[.font:NSFont.systemFont(ofSize:55),.foregroundColor:NSColor.white])
    NSGraphicsContext.restoreGraphicsState();try rep.representation(using:.png,properties:[:])!.write(to:url)
    line.hang(url,quietly:true)
   }
   for i in 0..<14 {line.texts.add("Synthetic text \(i) 🌍\nA second line\nThird line")}
   let ideas=try store.createCollection("Video ideas"), references=try store.createCollection("References")
   for i in 0..<8 {
    let url=URL(string:i == 0 ? "https://youtu.be/jNQXAC9IVRw" : "https://example.com/reference/\(i)")!
    var thumbnail = self.line.items[i].url.path
    if i == 0 {
     let context = CGContext(data:nil,width:480,height:360,bitsPerComponent:8,bytesPerRow:0,space:CGColorSpaceCreateDeviceRGB(),bitmapInfo:CGImageAlphaInfo.premultipliedLast.rawValue)!
     context.setFillColor(NSColor.black.cgColor);context.fill(CGRect(x:0,y:0,width:480,height:360))
     context.setFillColor(NSColor.systemTeal.cgColor);context.fill(CGRect(x:0,y:45,width:480,height:270))
     let image=NSBitmapImageRep(cgImage:context.makeImage()!),file=f.folder.appendingPathComponent("youtube-letterbox.png")
     try image.representation(using:.png,properties:[:])!.write(to:file);thumbnail=file.path
    }
    if let record=line.links.add(url) {try store.update(record.id){$0.title=i == 0 ? "Me at the zoo — synthetic preview" : "Synthetic reference \(i)";$0.author="Example channel";$0.thumbnailPath=thumbnail;$0.metadataState="ready"};if i%2 == 0 {try store.assign([record.id],to:ideas)} }
   }
   try store.toggleFavorite(Array(line.items.prefix(6).map(\.id))+Array(line.texts.entries.prefix(5).map(\.id)))
   try store.assign(Array(line.items.prefix(4).map(\.id)),to:references)
   try store.addTag("thumbnail",to:Array(line.items.prefix(3).map(\.id)))
   try store.addTag("script",to:Array(line.texts.entries.prefix(3).map(\.id)))
   line.setPresentation(.all,requestFocus:false)
   UserDefaults.standard.set(true,forKey:"welcomed")
   UserDefaults.standard.set([:],forKey:"shortcut")
   UserDefaults.standard.set(true,forKey:"menuBarRevealOff")
   UserDefaults.standard.set(true,forKey:"quietHang")
   UserDefaults.standard.set(true,forKey:"inboxOffered")
   UserDefaults.standard.set(false,forKey:"clipboardEnabled")
   UserDefaults.standard.set(false,forKey:"textClipboardEnabled")
   UserDefaults.standard.set(false,forKey:"linkClipboardEnabled")
   UserDefaults.standard.set(false,forKey:"linkMetadataEnabled")
   UserDefaults.standard.set(false,forKey:"inboxEnabled")
   copyBoard.clearContents()
   // The harness exercises the full application paste route, while every
   // destination/permission/event operation stays synthetic. No AX access,
   // real app activation or OS key injection is performed by this fixture.
   let ownPID=ProcessInfo.processInfo.processIdentifier
   let pasteEnvironment=DirectPasteCoordinator.Environment(ownPID:ownPID,
    trusted:{true},
    frontmostPID:{
     if self.mockPasteActivating{return self.mockPasteTargetPID}
     return NSApp.keyWindow?.isVisible == true ? ownPID : self.mockPasteTargetPID
    },
    running:{$0 == self.mockPasteTargetPID},
    focusedField:{$0 == self.mockPasteTargetPID ? .init(identity:self.mockPasteField,editable:true,secure:false) : nil},
    sameField:{$0.identity === $1.identity},
    activate:{pid in guard pid == self.mockPasteTargetPID else{return false};self.mockPasteActivating=true;return true},
    write:{ClipboardTransfer.write($0,to:self.copyBoard)},
    sendPaste:{pid in
     guard pid == self.mockPasteTargetPID else{return false}
     self.mockPasteRequests += 1;self.mockPasteTargetPIDs.append(pid)
     self.mockPasteText=self.copyBoard.string(forType:.string) ?? ""
     self.mockPasteActivating=false;return true
    },
    pause:{await Task.yield()})
   let simulatedPaste=DirectPasteCoordinator(environment:pasteEnvironment)
   simulatedPaste.captureTarget()
   delegate=AppDelegate(line:line,clipboardSource:clipboard,watchesFiles:false,copyPasteboard:copyBoard,directPaste:simulatedPaste)
   delegate.applicationDidFinishLaunching(n)
   let menu=NSMenu(), app=NSMenu(), item=NSMenuItem(title:"ClipboardLine UI Test",action:nil,keyEquivalent:"")
   app.addItem(ClosureMenuItem("Settings…",key:","){self.delegate.showSettings()})
   app.addItem(ClosureMenuItem("Add 200 synthetic images"){self.addStressImages()})
   app.addItem(ClosureMenuItem("Add shelf paging fixtures"){self.addShelfPagingFixtures()})
   app.addItem(ClosureMenuItem("Show drop receiver"){self.showReceiver()})
   app.addItem(ClosureMenuItem("Inject new synthetic text"){self.clipboard.inject()})
   app.addItem(ClosureMenuItem("Inject synthetic URL"){self.clipboard.injectLink()})
   app.addItem(ClosureMenuItem("Open native text copy fixture"){self.openNativeTextCopyFixture()})
   app.addItem(ClosureMenuItem("Open library"){self.delegate.showLibrary()})
   app.addItem(ClosureMenuItem("Open image markup fixture"){self.openImageMarkupFixture()})
   app.addItem(ClosureMenuItem("Narrow markup viewport"){self.resizeMarkupFixture(width:620)})
   app.addItem(ClosureMenuItem("Wide markup viewport"){self.resizeMarkupFixture(width:1100)})
   app.addItem(ClosureMenuItem("Open global search"){self.delegate.openShelfSearch()})
   app.addItem(ClosureMenuItem("Open commands"){self.delegate.showCommands()})
   app.addItem(ClosureMenuItem("Add 10,000 library records"){self.addLibraryStress()})
   app.addItem(ClosureMenuItem("Show keyboard line"){self.openKeyboardLine()})
   app.addItem(ClosureMenuItem("Finish test",key:"q"){NSApp.terminate(nil)})
   item.submenu=app; menu.addItem(item)
   let settings=NSMenuItem(title:"Feature settings",action:nil,keyEquivalent:"")
   let settingsMenu=NSMenu(); settingsMenu.delegate=delegate
   settings.submenu=settingsMenu;menu.addItem(settings);NSApp.mainMenu=menu
   EditingMenu.install()
   pointerMonitor=NSEvent.addLocalMonitorForEvents(matching:[.leftMouseDown,.leftMouseDragged,.leftMouseUp]) { e in
    MainActor.assumeIsolated {
     if let w=e.window, let c=w.contentView {let p=c.convert(e.locationInWindow,from:nil);let h=c.hitTest(c.convert(p,to:c.superview));self.pointerEvents.append(["mouse":[NSEvent.mouseLocation.x,NSEvent.mouseLocation.y],"screen":[w.convertPoint(toScreen:e.locationInWindow).x,w.convertPoint(toScreen:e.locationInWindow).y],"type":e.type.rawValue,"window":w.title,"point":[p.x,p.y],"hit":h.map{String(describing:type(of:$0))} ?? "none"]);self.pointerEvents=Array(self.pointerEvents.suffix(20))}
    };return e
   }
   timer=Timer.scheduledTimer(withTimeInterval:0.4,repeats:true){_ in MainActor.assumeIsolated{self.record()}}
   delegate.showLibrary()
   installFixtureControls()
  }catch{fatalError("Synthetic harness setup failed")}
 }
 func installFixtureControls(){
  guard let window=delegate.libraryController?.window,let content=window.contentView else{return}
  let shell=NSView(frame:content.frame)
  content.translatesAutoresizingMaskIntoConstraints=false;shell.addSubview(content)
  NSLayoutConstraint.activate([content.leadingAnchor.constraint(equalTo:shell.leadingAnchor),content.trailingAnchor.constraint(equalTo:shell.trailingAnchor),content.topAnchor.constraint(equalTo:shell.topAnchor),content.bottomAnchor.constraint(equalTo:shell.bottomAnchor)])
  let button=NSButton(title:"Fixture tools",target:self,action:#selector(showFixtureControls))
  button.bezelStyle = .rounded;button.frame=NSRect(x:22,y:48,width:160,height:28);button.setAccessibilityLabel("Fixture tools")
  shell.addSubview(button);window.contentView=shell
 }
 @objc func showFixtureControls(){
  if let controlsWindow {controlsWindow.makeKeyAndOrderFront(nil);return}
  let actions:[(String,() -> Void)]=[
   ("Show library",{self.delegate.showLibrary()}),
   ("Show keyboard shelves",{self.openKeyboardLine()}),
   ("Add shelf paging fixtures",{self.addShelfPagingFixtures()}),
   ("Open image markup fixture",{self.openImageMarkupFixture()}),
   ("Open global search",{self.delegate.openShelfSearch()}),
   ("Open commands",{self.delegate.showCommands()}),
   ("Show pointer shelves",{self.controlsWindow?.orderOut(nil);self.delegate.libraryController?.window?.orderOut(nil);if let screen=NSScreen.main{self.delegate.revealFromPointer(on:screen)}}),
   ("Add 200 shelf images",{self.addStressImages();self.openKeyboardLine()}),
   ("Add 10,000 library records",{self.addLibraryStress();self.delegate.showLibrary()}),
   ("Add image search fixtures",{self.addSearchFixtures();self.delegate.showLibrary()}),
   ("Inject synthetic text",{self.clipboard.inject();self.delegate.libraryController?.window?.makeKeyAndOrderFront(nil)}),
   ("Inject synthetic URL",{self.clipboard.injectLink();self.delegate.libraryController?.window?.makeKeyAndOrderFront(nil)}),
   ("Copy dedup text A",{self.copyDedupText("Synthetic exact repeat A 🌍\nSecond line");self.delegate.showLibrary()}),
   ("Copy dedup text B",{self.copyDedupText("Synthetic distinct text B");self.delegate.showLibrary()}),
   ("Open native text copy fixture",{self.openNativeTextCopyFixture()}),
   ("Show drop receiver",{self.delegate.libraryController?.window?.makeKeyAndOrderFront(nil);self.showReceiver()}),
   ("Light appearance",{NSApp.appearance=NSAppearance(named:.aqua);self.delegate.showLibrary()}),
   ("Dark appearance",{NSApp.appearance=NSAppearance(named:.darkAqua);self.delegate.showLibrary()}),
   ("Finish test",{NSApp.terminate(nil)})
  ]
  fixtureActions=actions.map(\.1)
  let stack=NSStackView();stack.orientation = .vertical;stack.spacing=9;stack.alignment = .leading;stack.translatesAutoresizingMaskIntoConstraints=false
  for (index,action) in actions.enumerated(){let button=NSButton(title:action.0,target:self,action:#selector(runFixtureAction(_:)));button.tag=index;button.bezelStyle = .rounded;button.setAccessibilityLabel(action.0);stack.addArrangedSubview(button)}
  let panel=NSPanel(contentRect:NSRect(x:0,y:0,width:320,height:CGFloat(actions.count)*35+40),styleMask:[.titled,.closable],backing:.buffered,defer:false)
  panel.title="Fixture tools — ClipboardLine UI Test";panel.isReleasedWhenClosed=false;panel.hidesOnDeactivate=false;panel.collectionBehavior=[.fullScreenAuxiliary,.canJoinAllSpaces]
  panel.contentView!.addSubview(stack)
  NSLayoutConstraint.activate([stack.leadingAnchor.constraint(equalTo:panel.contentView!.leadingAnchor,constant:20),stack.topAnchor.constraint(equalTo:panel.contentView!.topAnchor,constant:20)])
  panel.center();controlsWindow=panel;panel.makeKeyAndOrderFront(nil)
 }
 @objc func runFixtureAction(_ sender:NSButton){
  guard fixtureActions.indices.contains(sender.tag) else{return}
  controlsWindow?.orderOut(nil);fixtureActions[sender.tag]()
 }
 func copyDedupText(_ value:String){
  f.date.addTimeInterval(1);dedupWatcher.start();clipboard.injectText(value);dedupWatcher.check()
 }
 func openNativeTextCopyFixture(){
  controlsWindow?.orderOut(nil)
  if let nativeTextCopyWindow {
   nativeTextCopyWindow.makeKeyAndOrderFront(nil)
   nativeTextWatcher.start();selectNativeTextVariant(at:0);return
  }
  let panel=NSPanel(contentRect:NSRect(x:0,y:0,width:720,height:360),styleMask:[.titled,.closable,.resizable],backing:.buffered,defer:false)
  panel.title="Native text copy fixture — ClipboardLine UI Test"
  panel.isReleasedWhenClosed=false;panel.hidesOnDeactivate=false;panel.delegate=self
  panel.minSize=NSSize(width:640,height:330)
  let stack=NSStackView();stack.orientation = .vertical;stack.alignment = .leading;stack.spacing=12;stack.translatesAutoresizingMaskIntoConstraints=false
  let heading=NSTextField(labelWithString:"Select a fixed variant, then press ⌘C. Copy A → B → A to check order.")
  heading.font = .systemFont(ofSize:14,weight:.medium);stack.addArrangedSubview(heading)
  let buttons=NSStackView();buttons.orientation = .horizontal;buttons.spacing=8
  for (index,variant) in nativeTextVariants.enumerated(){
   let button=NSButton(title:variant.0,target:self,action:#selector(selectNativeTextVariant(_:)))
   button.tag=index;button.bezelStyle = .rounded;button.setAccessibilityLabel("Select "+variant.0);buttons.addArrangedSubview(button)
  }
  stack.addArrangedSubview(buttons)
  let scroll=NSScrollView();scroll.hasVerticalScroller=true;scroll.borderType = .bezelBorder;scroll.translatesAutoresizingMaskIntoConstraints=false
  let textView=NSTextView(frame:NSRect(x:0,y:0,width:660,height:160))
  textView.isEditable=false;textView.isSelectable=true;textView.isRichText=false
  textView.font = .monospacedSystemFont(ofSize:19,weight:.regular);textView.textContainerInset=NSSize(width:14,height:14)
  textView.isHorizontallyResizable=false;textView.isVerticallyResizable=true;textView.autoresizingMask=[.width]
  textView.textContainer?.widthTracksTextView=true;textView.setAccessibilityLabel("Native fixed text copy source")
  scroll.documentView=textView;stack.addArrangedSubview(scroll)
  let footer=NSTextField(labelWithString:"Native watcher is active only while this fixture is open. Close it to stop capture.")
  footer.font = .systemFont(ofSize:12);footer.textColor = .secondaryLabelColor;stack.addArrangedSubview(footer)
  panel.contentView!.addSubview(stack)
  NSLayoutConstraint.activate([
   stack.leadingAnchor.constraint(equalTo:panel.contentView!.leadingAnchor,constant:20),stack.trailingAnchor.constraint(equalTo:panel.contentView!.trailingAnchor,constant:-20),
   stack.topAnchor.constraint(equalTo:panel.contentView!.topAnchor,constant:20),stack.bottomAnchor.constraint(equalTo:panel.contentView!.bottomAnchor,constant:-20),
   scroll.widthAnchor.constraint(equalTo:stack.widthAnchor),scroll.heightAnchor.constraint(greaterThanOrEqualToConstant:150)
  ])
  nativeTextCopyWindow=panel;nativeTextView=textView
  panel.center();panel.makeKeyAndOrderFront(nil);nativeTextWatcher.start();selectNativeTextVariant(at:0)
 }
 @objc func selectNativeTextVariant(_ sender:NSButton){selectNativeTextVariant(at:sender.tag)}
 func selectNativeTextVariant(at index:Int){
  guard nativeTextVariants.indices.contains(index),let view=nativeTextView else{return}
  let variant=nativeTextVariants[index];nativeTextVariant=variant.0;view.string=variant.1
  nativeTextCopyWindow?.makeFirstResponder(view);view.setSelectedRange(NSRange(location:0,length:(variant.1 as NSString).length))
 }
 func receiveNativeFixtureText(_ value:String){
  guard nativeTextCopyWindow?.isVisible == true,
        nativeTextVariants.contains(where:{$0.1.utf8.elementsEqual(value.utf8)}) else{return}
  f.date.addTimeInterval(1);delegate.receiveCopiedText(value)
  nativeTextCaptures.append(["text":value,"bytes":value.utf8.count,"scalars":value.unicodeScalars.map{String(format:"U+%04X",$0.value)},"texts":line.texts.entries.count])
  nativeTextCaptures=Array(nativeTextCaptures.suffix(20));record()
 }
 func windowWillClose(_ notification:Notification){
  if let window=notification.object as? NSWindow,window === nativeTextCopyWindow {nativeTextWatcher.stop()}
 }
 func applicationShouldHandleReopen(_ sender:NSApplication,hasVisibleWindows flag:Bool)->Bool {delegate.showSettings();return true}
 func addStressImages(){
  guard let source=line.items.first?.url,let data=try? Data(contentsOf:source) else{return}
  for _ in 0..<200 {if let url=try? f.image(){try? data.write(to:url);line.hang(url,quietly:true)}}
 }
 /// Keep this fixture separate from the stress test: 31 entries make several
 /// numbered groups and a partial last group at normal display widths. All
 /// image bytes and link thumbnails come from the existing synthetic fixture.
 func addShelfPagingFixtures(){
  do {
   if !pagingFixtureLoaded {
    guard let source=line.items.first?.url else{return}
    let pixels=try Data(contentsOf:source)
    let counts:[LibraryKind:Int]=[.image:line.items.count,.text:line.texts.entries.count,.link:line.links.entries.count]
    var records=[LibraryRecord]()
    for kind in LibraryKind.allCases {
     for index in (counts[kind] ?? 0)..<max(31,counts[kind] ?? 0) {
      f.date.addTimeInterval(1)
      var record=LibraryRecord(id:UUID(),kind:kind,createdAt:f.date,updatedAt:f.date)
      record.title="Paging \(kind.rawValue) \(index + 1)";record.metadataState="ready"
      switch kind {
      case .image:
       let url=try f.image();try pixels.write(to:url);record.path=url.path
      case .text:
       record.text="Synthetic paging text \(index + 1)\nUse Option–Left and Option–Right";record.lastCapturedAt=f.date
      case .link:
       let url=URL(string:"https://example.com/paging/\(index + 1)")!
       record.originalURL=url.absoluteString;record.normalizedURL=LinkIdentity.normalized(url)
       record.metadataTitle=record.title;record.author="Synthetic fixture";record.thumbnailPath=source.path
      }
      records.append(record)
     }
    }
    try store.importRecords(records);pagingFixtureLoaded=true
   }
   _ = line.closeShelfSearch(requestFocus:false)
   for shelf in Shelf.allCases {line.focusShelf(shelf,requestFocus:false);line.setActiveFavorites(false)}
   line.setPresentation(.all,requestFocus:false);line.focusShelf(.images,requestFocus:false)
   line.cancelSelection();line.texts.cancelSelection();line.links.cancelSelection()
   line.setScrollOffset(0);line.texts.scroll(line.texts.scrollOffset,width:line.viewportWidth);line.links.scroll(line.links.scrollOffset,width:line.viewportWidth)
   controlsWindow?.orderOut(nil);delegate.libraryController?.window?.orderOut(nil);openKeyboardLine()
  }catch{line.notice="Synthetic paging fixture failed"}
 }
 func addLibraryStress(){
  guard let source=line.items.first?.url,let pixels=try? Data(contentsOf:source) else{return}
  do {
   var records=[LibraryRecord]()
   for i in 0..<10000 {
    let kind:LibraryKind=i<1000 ? .image : i<4000 ? .link : .text
    var record=LibraryRecord(id:UUID(),kind:kind,createdAt:f.date.addingTimeInterval(Double(i)),updatedAt:f.date)
    record.retainedAt=f.date;record.onShelf=false;record.title="Stress fixture \(i)";record.metadataState="ready"
    if kind == .image {let url=try f.image();try pixels.write(to:url);record.path=url.path}
    else if kind == .text {record.text="Synthetic searchable note \(i) · İstanbul 中文\nLine two\nLine three"}
    else {record.originalURL="https://example.com/stress/\(i)";record.normalizedURL=LinkIdentity.normalized(URL(string:record.originalURL!)!)}
    records.append(record)
   }
   try store.importRecords(records)
  }catch{line.notice="Synthetic stress fixture failed"}
 }
 func addSearchFixtures(){
  do {
   for i in 0..<4 {
    let url=try f.image(), rep=NSBitmapImageRep(bitmapDataPlanes:nil,pixelsWide:800,pixelsHigh:500,bitsPerSample:8,samplesPerPixel:4,hasAlpha:true,isPlanar:false,colorSpaceName:.deviceRGB,bytesPerRow:0,bitsPerPixel:0)!
    NSGraphicsContext.saveGraphicsState();NSGraphicsContext.current=NSGraphicsContext(bitmapImageRep:rep)
    NSColor.white.setFill();NSBezierPath(rect:NSRect(x:0,y:0,width:800,height:500)).fill()
    if i == 0 {NSColor.red.setFill();NSBezierPath(ovalIn:NSRect(x:220,y:70,width:360,height:360)).fill()}
    else if i == 1 {NSColor.blue.setFill();NSBezierPath(rect:NSRect(x:220,y:70,width:360,height:360)).fill()}
    else if i == 2 {NSColor.green.setFill();let p=NSBezierPath();p.move(to:NSPoint(x:400,y:440));p.line(to:NSPoint(x:170,y:60));p.line(to:NSPoint(x:630,y:60));p.close();p.fill()}
    else {("ORBITAL 8427\nİstanbul sahne notu" as NSString).draw(at:NSPoint(x:50,y:200),withAttributes:[.font:NSFont.systemFont(ofSize:48),.foregroundColor:NSColor.black])}
    NSGraphicsContext.restoreGraphicsState();try rep.representation(using:.png,properties:[:])!.write(to:url)
    if let id=line.hang(url,quietly:true) {try store.retain([id])}
   }
  }catch{line.notice="Search fixture creation failed"}
 }
 func showReceiver(){
  guard let window=delegate.libraryController?.window,let content=window.contentView else{return}
  if embeddedReceiver == nil {
   // Keep source and destination in the same Computer Use window crop.
   // Entry/update telemetry is separate from an actual accepted drop.
   let receiver=DropReceiver(frame:NSRect(x:22,y:100,width:185,height:140))
   receiver.onEnter={types in self.receiverEntries += 1;self.receivedTypes=types}
   receiver.onUpdate={self.receiverUpdates += 1}
   receiver.onPrepare={self.receiverPreparations += 1}
   receiver.onDrop={count,types in self.received=count;self.receivedTypes=types}
   content.addSubview(receiver);embeddedReceiver=receiver
  }
  window.makeKeyAndOrderFront(nil)
 }
 func openKeyboardLine(){
  let menu=NSMenu(); delegate.menuNeedsUpdate(menu)
  if let hide=menu.items.firstIndex(where:{$0.title==L("Hide line")}){menu.performActionForItem(at:hide)}
  delegate.menuNeedsUpdate(menu)
  if let show=menu.items.firstIndex(where:{$0.title==L("Show line")}){menu.performActionForItem(at:show)}
 }
 /// This opens only an existing synthetic image. Marks are created by the
 /// actual pointer/text events in Computer Use, never injected into the model.
 func openImageMarkupFixture(){
  let available=line.items.filter{!$0.isRecording}
  let id=markupFixtureID.flatMap{candidate in available.first{$0.id == candidate}?.id} ?? available.first?.id
  guard let id else{return}
  markupFixtureID=id;controlsWindow?.orderOut(nil);delegate.libraryController?.window?.orderOut(nil)
  openKeyboardLine();delegate.showPreview(id);delegate.preview?.beginMarkup()
 }
 func resizeMarkupFixture(width:CGFloat){
  guard let preview=delegate.preview,preview.isMarkupEditing else{return}
  var frame=preview.window.frame
  let visible=preview.window.screen?.visibleFrame ?? frame,center=frame.midX
  frame.size.width=min(width,max(240,visible.width-24))
  frame.origin.x=max(visible.minX,min(visible.maxX-frame.width,center-frame.width/2))
  preview.window.setFrame(frame,display:true)
 }
 func record(){
  let panel=delegate.panel!
  func wrap(_ view:NSView) {
   if let g=view as? GrabView,wrappedGrabs.insert(ObjectIdentifier(g)).inserted {let start=g.onDragStart,end=g.onDragEnd;g.onDragStart={self.nativeDragStarts += 1;start()};g.onDragEnd={self.nativeDragEnds += 1;end()}}
   for child in view.subviews {wrap(child)}
  }
  if let view=panel.contentView {wrap(view)}
  if let view=delegate.libraryController?.window?.contentView {wrap(view)}
  var state:[String:Any] = ["key":panel.isKeyWindow,"keyboardAllowed":panel.keyboardFocusAllowed,"copies":copies,
    "processID":ProcessInfo.processInfo.processIdentifier,
    "presentation":line.presentation.rawValue,"activeShelf":line.activeShelf.rawValue,"textSelected":line.texts.selectedIDs.count,"received":received,
    "selected":line.selectedIDs.count,"pins":line.items.filter(\.pinned).count,"items":line.items.count,
    "imageOffset":Double(line.scrollOffset),"textOffset":Double(line.texts.scrollOffset),"texts":line.texts.entries.count,
    "textPins":line.texts.entries.filter(\.pinned).count,"textCopied":line.texts.copiedIDs.count,"imageFavorites":line.favoritesOnly,"textFavorites":line.texts.favoritesOnly,
    "thumbnailDecodes":line.thumbnails.decodeCount,"thumbnailMaxConcurrent":line.thumbnails.peakConcurrentDecodes,"thumbnailDecodedOnMain":line.thumbnails.decodedOnMainThread,
    "textMode":line.showingTexts,"textEnabled":TextClipboardWatcher.isEnabled,"imageEnabled":ClipboardWatcher.isEnabled]
  state["previewShelf"] = delegate.previewSession?.shelf.rawValue ?? "none"
  state["previewPosition"] = delegate.previewSession?.position ?? "none"
  let previewWindow = delegate.previewWindow
  state["previewWindowNumber"] = previewWindow?.windowNumber ?? -1
  state["previewWindowVisible"] = previewWindow?.isVisible ?? false
  state["previewHasCurrentItem"] = delegate.previewSession?.hasCurrentItem ?? false
  state["previewPinned"] = delegate.previewSession?.pinned ?? false
  let folderPicker=delegate.pinFolderPicker ?? delegate.libraryController?.pinFolderPicker
  state["pinFolderPickerVisible"] = folderPicker?.window.isVisible ?? false
  state["pinFolderPickerCount"] = folderPicker?.ids.count ?? 0
  state["pinFolderPickerQuery"] = folderPicker?.searchQuery ?? ""
  state["pinFolderPickerCreating"] = folderPicker?.creating ?? false
  state["pinFolderPickerSelectedRow"] = folderPicker?.table.selectedRow ?? -1
  state["pinFolderPickerChoices"] = folderPicker?.choices.map{["id":$0.id?.uuidString ?? "none","title":$0.title,"depth":$0.depth] as [String:Any]} ?? []
  let tagPicker=delegate.tagPicker ?? delegate.libraryController?.tagPicker
  state["tagPickerVisible"] = tagPicker?.window.isVisible ?? false
  state["tagPickerCount"] = tagPicker?.ids.count ?? 0
  state["tagPickerQuery"] = tagPicker?.searchQuery ?? ""
  state["tagPickerSelectedRow"] = tagPicker?.table.selectedRow ?? -1
  state["tagPickerChoices"] = tagPicker?.choices.map{["id":$0.id?.uuidString ?? "none","title":$0.title,"isNew":$0.isNew] as [String:Any]} ?? []
  state["settingsSection"] = delegate.settingsController?.model.section.rawValue ?? "none"
  if let frame=delegate.commandPalette?.window.frame { state["paletteFrame"]=[Double(frame.minX),Double(frame.minY),Double(frame.width),Double(frame.height)] }
  state["paletteVisible"] = delegate.commandPalette?.window.isVisible ?? false
  state["paletteQuery"] = delegate.commandPalette?.query ?? ""
  state["paletteSelectedID"] = delegate.commandPalette?.selectedCommandID ?? "none"
  state["paletteCommands"] = delegate.commandPalette?.visibleCommands.map{["id":$0.id,"title":$0.title,"keyHint":$0.keyHint,"enabled":$0.isEnabled,"group":$0.group,"reason":$0.disabledReason,"active":$0.isActive] as [String:Any]} ?? []
  state["quickSelectionIDs"] = line.quickSelectionIDs.map(\.uuidString)
  state["quickSelectionNumbers"] = line.quickSelectionIDs.map{["id":$0.uuidString,"number":line.quickSelectionNumber($0,shelf:line.activeShelf) ?? 0] as [String:Any]}
  state["pagingFixtureLoaded"]=pagingFixtureLoaded
  state["linkOffset"]=Double(line.links.scrollOffset)
  state["imageFocusedID"]=line.focusedID?.uuidString ?? "none"
  state["textFocusedID"]=line.texts.focusedID?.uuidString ?? "none"
  state["linkFocusedID"]=line.links.focusedID?.uuidString ?? "none"
  state["viewportWidth"]=Double(line.viewportWidth)
  state["cardSpacing"]=Double(Layout.spacing)
  let pagingRows:[Shelf:[UUID]]=[.images:line.displayItems.filter{!$0.falling}.map(\.id),.texts:line.texts.displayEntries.map(\.id),.links:line.links.displayEntries.map(\.id)]
  state["pagingOrderedIDs"]=Dictionary(uniqueKeysWithValues:pagingRows.map{($0.key.rawValue,$0.value.map(\.uuidString))})
  let activePagingRow=pagingRows[line.activeShelf] ?? [],quickPagingIDs=line.quickSelectionIDs
  let pagingFocus:UUID?=switch line.activeShelf {case .images:line.focusedID;case .texts:line.texts.focusedID;case .links:line.links.focusedID}
  state["quickPage"]=["startOrdinal":quickPagingIDs.first.flatMap{activePagingRow.firstIndex(of:$0)}.map{$0 + 1} ?? 0,"total":activePagingRow.count,"numberedCount":quickPagingIDs.count,"focusedNumber":pagingFocus.flatMap{line.quickSelectionNumber($0,shelf:line.activeShelf)} ?? 0]
  state["activeActionIDs"] = line.activeActionIDs.map(\.uuidString)
  let actionIDs=Set(line.activeActionIDs + (delegate.previewSession.map{[$0.currentID]} ?? []) + (delegate.libraryController?.keyboardActionIDs ?? []))
  state["actionRecords"]=(try? store.records(Array(actionIDs)))?.map{["id":$0.id.uuidString,"kind":$0.kind.rawValue,"title":$0.title,"text":String(($0.text ?? "").prefix(200)),"pinned":$0.favorite] as [String:Any]} ?? []
  state["libraryPreviewID"]=delegate.libraryController?.previewCurrentID?.uuidString ?? "none"
  state["libraryPreviewMarkup"]=delegate.libraryController?.previewImage?.isMarkupEditing ?? false
  state["libraryPreviewTool"]=delegate.libraryController?.previewImage?.canvas.tool.rawValue ?? "none"
  state["libraryPreviewCropping"]=delegate.libraryController?.previewImage?.isCropping ?? false
  state["libraryPreviewCrop"]=delegate.libraryController?.previewImage?.document.crop.map{[$0.x,$0.y,$0.width,$0.height]} ?? []
  state["libraryPreviewTextEditing"]=delegate.libraryController?.previewTextIsEditing ?? false
  state["lineNotice"] = line.notice ?? ""
  state["dedupExactMatches"] = line.texts.entries.filter{$0.text.utf8.elementsEqual("Synthetic exact repeat A 🌍\nSecond line".utf8)}.count
  state["nativeTextCopyFixtureVisible"] = nativeTextCopyWindow?.isVisible ?? false
  state["nativeTextCopyVariant"] = nativeTextVariant
  state["nativeTextCopyCaptures"] = nativeTextCaptures
  state["nativeTextCopyRecords"] = line.texts.entries.filter{entry in nativeTextVariants.contains{$0.1.utf8.elementsEqual(entry.text.utf8)}}.map{["id":$0.id.uuidString,"text":$0.text,"bytes":$0.text.utf8.count,"title":$0.title ?? "","pinned":$0.pinned] as [String:Any]}
  state["textOrder"] = line.texts.entries.prefix(3).map{["id":$0.id.uuidString,"text":$0.text,"title":$0.title ?? "","pinned":$0.pinned] as [String:Any]}
  state["directPasteMode"] = "simulated — no OS AX or key events"
  state["mockPasteRequests"] = mockPasteRequests
  state["mockPasteTargetPID"] = mockPasteTargetPID
  state["mockPasteTargetPIDs"] = mockPasteTargetPIDs
  state["mockPasteText"] = String(mockPasteText.prefix(65536))
  state["namedCopyBoardString"] = String((copyBoard.string(forType:.string) ?? "").prefix(65536))
  state["namedCopyBoardTypes"] = copyBoard.types?.map(\.rawValue) ?? []
  state["lastCopiedImagePath"]=lastCopiedImagePath;state["lastCopiedImageSize"]=lastCopiedImageSize
  if let data=copyBoard.data(forType:.png),let pixels=NSBitmapImageRep(data:data){state["namedCopyPNGSize"]=[pixels.pixelsWide,pixels.pixelsHigh]}
  state["folderMembershipCounts"] = (try? store.collections())?.map { folder in ["name":folder.name,"count":(try? store.queryIDs(LibraryQuery(scope:.collection(folder.id))).count) ?? 0] } ?? []
  state["tagMembershipCounts"] = (try? store.tags())?.map { tag in ["name":tag.name,"count":(try? store.queryIDs(LibraryQuery(scope:.tag(tag.id))).count) ?? 0] } ?? []
  state["markupFixtureID"]=markupFixtureID?.uuidString ?? "none"
  if let id=markupFixtureID,let record=try? store.item(id){
   state["markupFixtureStoredCount"]=record.imageMarkup?.elements.count ?? 0
   state["markupFixtureRenderedPath"]=record.fileURL?.path ?? ""
   state["markupFixtureSourcePath"]=record.markupSourceURL?.path ?? ""
  }
  if let preview=delegate.preview {
   state["previewZoom"]=Double(preview.scroll.zoom.scale)
   state["previewPan"]=[Double(preview.scroll.contentView.bounds.origin.x),Double(preview.scroll.contentView.bounds.origin.y)]
   state["previewFrame"]=[Double(preview.window.frame.minX),Double(preview.window.frame.minY),Double(preview.window.frame.width),Double(preview.window.frame.height)]
   let canvas=preview.canvas
   state["markupFixtureID"]=markupFixtureID?.uuidString ?? "none"
   state["markupCurrentID"]=delegate.previewSession?.currentID.uuidString ?? "none"
   state["markupEditing"]=preview.isMarkupEditing
   state["markupTextEditing"]=canvas.isTextEditing
   state["markupUnsaved"]=preview.hasUnsavedMarkup
   state["markupTool"]=canvas.tool.rawValue
   state["imageCropping"]=preview.isCropping
   state["imageCrop"]=preview.document.crop.map{[$0.x,$0.y,$0.width,$0.height]} ?? []
   state["cropSelection"]=canvas.cropSelection.map{[$0.x,$0.y,$0.width,$0.height]} ?? []
   state["markupSelectedID"]=canvas.selectedID?.uuidString ?? "none"
   state["markupElementCount"]=preview.document.elements.count
   state["markupCanUndo"]=canvas.canUndo;state["markupCanRedo"]=canvas.canRedo
   state["markupSpaceHeld"]=canvas.spaceHeld
   state["markupStatus"]=preview.toolbar.statusLabel.stringValue
   let toolbarFrame=preview.toolbar.convert(preview.toolbar.bounds,to:nil)
   let controlsFrame=preview.controls.convert(preview.controls.bounds,to:nil)
   state["markupToolbarWindowFrame"]=[Double(toolbarFrame.minX),Double(toolbarFrame.minY),Double(toolbarFrame.width),Double(toolbarFrame.height)]
   state["markupControlsWindowFrame"]=[Double(controlsFrame.minX),Double(controlsFrame.minY),Double(controlsFrame.width),Double(controlsFrame.height)]
   state["markupUsesSharedBar"]=preview.toolbar.isDescendant(of:preview.controls)
   state["markupTextDraft"]=String((canvas.textEditor?.string ?? "").prefix(4000))
   state["markupDocument"]=preview.document.elements.map{element in
    ["id":element.id.uuidString,"tool":element.tool.rawValue,"points":element.points.map{[$0.x,$0.y]},
     "lineWidth":element.lineWidth,"fill":element.fill,"text":element.text ?? "",
     "fontSize":element.fontSize,"color":[element.color.red,element.color.green,element.color.blue,element.color.alpha]] as [String:Any]
   }
   let canvasFrame=canvas.convert(canvas.bounds,to:nil)
   state["markupCanvasWindowFrame"]=[Double(canvasFrame.minX),Double(canvasFrame.minY),Double(canvasFrame.width),Double(canvasFrame.height)]
   state["markupCanvasBounds"]=[Double(canvas.bounds.minX),Double(canvas.bounds.minY),Double(canvas.bounds.width),Double(canvas.bounds.height)]
   let clip=preview.scroll.contentView.bounds
   state["markupScrollBounds"]=[Double(clip.minX),Double(clip.minY),Double(clip.width),Double(clip.height)]
   if let id=delegate.previewSession?.currentID,let record=try? store.item(id){
    state["markupRenderedPath"]=record.fileURL?.path ?? ""
    state["markupSourcePath"]=record.markupSourceURL?.path ?? ""
    state["markupStoredElementCount"]=record.imageMarkup?.elements.count ?? 0
    state["storedImageCrop"]=record.imageMarkup?.crop.map{[$0.x,$0.y,$0.width,$0.height]} ?? []
   }
  }
  state["textPreviewEditing"] = delegate.textPreview?.isEditing ?? false
  state["textPreviewDraft"] = String((delegate.textPreview?.textView.string ?? "").prefix(180))
  state["lastCopiedText"] = String(lastCopiedText.prefix(180))
  state["size"] = line.size.rawValue
  state["linkCount"]=line.links.entries.count;state["linkSelection"]=line.links.selectedIDs.count;state["linkPins"]=line.links.entries.filter(\.favorite).count
  state["linkEnabled"]=LinkHistory.isEnabled;state["metadataEnabled"]=LinkMetadataService.isEnabled
  state["metadataMode"] = "synthetic fixture metadata; network metadata capture disabled"
  state["linkMetadata"] = line.links.entries.compactMap { entry -> [String:Any]? in
   guard let record=try? store.item(entry.id) else{return nil}
   return ["url":record.originalURL ?? "", "title":record.metadataTitle ?? "", "author":record.author ?? "", "state":record.metadataState, "thumbnail":record.thumbnailPath != nil]
  }
  state["revealed"]=line.revealed
  state["shelfSearchQuery"]=line.shelfSearchQuery
  state["shelfSearchScope"]=line.presentation.shelves.map(\.rawValue)
  state["shelfSearchTotal"]=line.shelfSearchResultCount
  state["shelfSearchEditing"]=line.searchEditingShelf?.rawValue ?? "none"
  state["shelfSearchQueries"]=Dictionary(uniqueKeysWithValues:Shelf.allCases.map{($0.rawValue,line.shelfSearch?.query(for:$0.libraryKind) ?? "")})
  state["shelfSearchActive"]=Shelf.allCases.filter{line.shelfSearch?.isActive(for:$0.libraryKind)==true}.map(\.rawValue)
  state["shelfSearchCounts"]=["images":line.displayItems.count,"texts":line.texts.displayEntries.count,"links":line.links.displayEntries.count]
  state["shelfFocusedColumns"]=["images":line.displayItems.firstIndex{$0.id == line.focusedID} ?? -1,"texts":line.texts.displayEntries.firstIndex{$0.id == line.texts.focusedID} ?? -1,"links":line.links.displayEntries.firstIndex{$0.id == line.links.focusedID} ?? -1]
  var searchFields=[[String:Any]]()
  func collectSearchFields(_ view:NSView){
   if let field=view as? ShelfSearchTextField {
    let frame=field.convert(field.bounds,to:nil), responder=field.window?.firstResponder
    searchFields.append(["shelf":field.shelf.rawValue,"query":field.stringValue,"frame":[frame.minX,frame.minY,frame.width,frame.height],"hidden":field.isHiddenOrHasHiddenAncestor,"windowKey":field.window?.isKeyWindow ?? false,"responder":responder.map{String(describing:type(of:$0))} ?? "none","ownsEditor":field.currentEditor() != nil && responder === field.currentEditor()])
   }
   for child in view.subviews{collectSearchFields(child)}
  }
  for window in NSApp.windows{if let content=window.contentView{collectSearchFields(content)}}
  state["shelfSearchFields"]=searchFields
  if let library=delegate.libraryController {
   state["libraryNotice"] = library.model.notice ?? library.model.store.notice ?? ""
   state["libraryItems"]=library.model.ids.count;state["librarySelected"]=library.model.selectedIDs.count;state["libraryFocused"]=library.model.focusedID?.uuidString ?? "none"
   state["librarySearch"]=library.model.search;state["libraryTitle"]=library.model.title;state["libraryList"]=library.model.listMode
   state["libraryFullScreen"]=library.window?.styleMask.contains(.fullScreen) ?? false
   state["libraryFirstResponder"]=library.window?.firstResponder.map{String(describing:type(of:$0))} ?? "none"
   state["libraryCopied"]=library.model.copiedIDs.count;state["libraryPasteboardItems"]=library.model.copyPasteboard.pasteboardItems?.count ?? 0
   state["libraryCachedSummaries"]=library.model.cachedSummaryCount;state["libraryPendingPages"]=library.model.pendingPageCount
   state["libraryUpdatesSuspended"]=library.model.updatesSuspended;state["libraryReloadCount"]=library.model.reloadCount
   state["libraryNativeToolbarItems"]=library.window?.toolbar?.items.map{$0.itemIdentifier.rawValue} ?? []
   state["libraryColumnWidths"]=library.splitController.splitViewItems.map{Double($0.viewController.view.frame.width)}
   state["librarySidebarCollapsed"]=library.splitController.splitViewItems.first?.isCollapsed ?? true
   state["libraryInspectorCollapsed"]=library.splitController.inspectorItem.isCollapsed
   if let stats=library.model.collectionStats?(){state["libraryCardConfigurations"]=stats.configurations;state["libraryCollectionRefreshes"]=stats.refreshes}
   if let stats=library.model.thumbnailStats?() {
    state["libraryThumbnailDecodes"]=stats.decodes;state["libraryThumbnailMaxConcurrent"]=stats.concurrent;state["libraryThumbnailOnMain"]=stats.onMain
    state["libraryThumbnailCachedCount"]=stats.cachedCount;state["libraryThumbnailCachedBytes"]=stats.cachedBytes;state["libraryThumbnailPending"]=stats.pending
   }
  }
  state["retentionDays"] = line.retentionDays
  state["textRetentionDays"] = line.retentionDays(for:.text)
  state["linkRetentionDays"] = line.retentionDays(for:.link)
  state["nativeDragStarts"]=nativeDragStarts;state["nativeDragEnds"]=nativeDragEnds;state["pointerEvents"]=pointerEvents
  state["statusCount"]=StatusSummary(line:line).count;state["statusDescription"]=StatusSummary(line:line).description
  state["statusButtonToolTip"]=delegate.statusToolTipForTesting;state["statusButtonDimmed"]=delegate.statusDimmedForTesting
  state["languageChoice"]=LanguagePreferences.selection();state["effectiveLanguage"]=Bundle.main.preferredLocalizations.first ?? "en"
  state["imageSearchStatus"]=store.imageSearchStatus;state["imageSearchRevision"]=store.searchRevision
  state["receiverEntries"]=receiverEntries;state["receiverUpdates"]=receiverUpdates;state["receiverPreparations"]=receiverPreparations;state["receivedTypes"]=receivedTypes
  state["windows"] = NSApp.windows.filter(\.isVisible).map(\.title)
  state["appActive"] = NSApp.isActive
  state["windowDiagnostics"] = NSApp.windows.map { window in
   ["title":window.title,"visible":window.isVisible,"occluded": !window.occlusionState.contains(.visible),
    "key":window.isKeyWindow,"hidesOnDeactivate":window.hidesOnDeactivate,
    "ignoresMouse":window.ignoresMouseEvents,"level":window.level.rawValue,
    "frame":[window.frame.minX,window.frame.minY,window.frame.width,window.frame.height],
    "screenFrame":window.screen.map{[$0.frame.minX,$0.frame.minY,$0.frame.width,$0.frame.height]} ?? []] as [String:Any]
  }
  if let data=try? JSONSerialization.data(withJSONObject:state,options:.sortedKeys){try? data.write(to:output.appendingPathComponent("ui-state.json"),options:.atomic)}
  // Live screenshots come from Computer Use. Periodic offscreen PNG rendering
  // would distort the main-thread scroll and allocation measurements.
 }
 func applicationWillTerminate(_ n:Notification){
  nativeTextWatcher.stop();record();timer?.invalidate();delegate.applicationWillTerminate(n)
  TextClipboardWatcher.isEnabled=false;ClipboardWatcher.isEnabled=false
  if !LanguagePreferences.relaunching {UserDefaults.standard.removePersistentDomain(forName:"local.clipboardline.uitests")}
  f.cleanup()
 }
}
final class DropReceiver:NSView {
 var onEnter:(([String])->Void)?
 var onUpdate:(()->Void)?
 var onPrepare:(()->Void)?
 var onDrop:((Int,[String])->Void)?
 var receivedCount=0
 override init(frame:NSRect){super.init(frame:frame);registerForDraggedTypes([.fileURL,.string,.png]);setAccessibilityElement(true);setAccessibilityLabel("Drop generated items here")}
 required init?(coder:NSCoder){fatalError()}
 override func draw(_ rect:NSRect){NSColor.systemBlue.setFill();bounds.fill();((receivedCount > 0 ? "Received \(receivedCount) items" : "Drop generated\nitems here") as NSString).draw(at:NSPoint(x:20,y:60),withAttributes:[.font:NSFont.systemFont(ofSize:18),.foregroundColor:NSColor.white])}
 override func draggingEntered(_ sender:NSDraggingInfo)->NSDragOperation {onEnter?(sender.draggingPasteboard.types?.map(\.rawValue) ?? []);return .copy}
 override func draggingUpdated(_ sender:NSDraggingInfo)->NSDragOperation {onUpdate?();return .copy}
 override func prepareForDragOperation(_ sender:NSDraggingInfo)->Bool {onPrepare?();return true}
 override func performDragOperation(_ sender:NSDraggingInfo)->Bool {
  receivedCount=sender.draggingPasteboard.pasteboardItems?.count ?? 0
  onDrop?(receivedCount,sender.draggingPasteboard.types?.map(\.rawValue) ?? []);setAccessibilityLabel("Received \(receivedCount) generated items");needsDisplay=true;return true
 }
}
@main enum HarnessMain {
 @MainActor static func main(){let app=NSApplication.shared;let delegate=HarnessDelegate();app.delegate=delegate;app.setActivationPolicy(.regular);app.run();_ = delegate}
}
