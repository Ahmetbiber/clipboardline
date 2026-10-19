import AppKit
import Combine
import SwiftUI

/// A hosting view follows its containing window's appearance even while the
/// reusable Library is ordered out. Disable intrinsic sizing so long notes
/// cannot force a split column or the entire window wider.
@MainActor final class LibraryHostedController<Content: View>: NSViewController {
    private let content: Content
    init(_ content: Content) { self.content = content; super.init(nibName: nil, bundle: nil) }
    required init?(coder: NSCoder) { fatalError() }
    override func loadView() {
        let host = NSHostingView(rootView: content); host.sizingOptions = []; view = host
    }
}

@MainActor final class LibrarySplitController: NSSplitViewController {
    let model: LibraryModel
    private(set) var sidebar: LibrarySidebarController!
    private(set) var inspectorItem: NSSplitViewItem!
    private var subscriptions = Set<AnyCancellable>()
    private var syncingInspector = false
    init(model: LibraryModel, line: Line, actions: LibraryWindowController) {
        self.model = model
        super.init(nibName: nil, bundle: nil)
        sidebar = LibrarySidebarController(model: model, actions: actions)
        let side = NSSplitViewItem(sidebarWithViewController: sidebar)
        side.minimumThickness = 180; side.maximumThickness = 320; side.canCollapse = true
        side.holdingPriority = .defaultLow
        let content = NSSplitViewItem(viewController: LibraryHostedController(LibraryContentView(model: model, line: line)))
        content.minimumThickness = 360
        inspectorItem = NSSplitViewItem(inspectorWithViewController: LibraryHostedController(LibraryInspectorView(model: model, actions: actions)))
        inspectorItem.minimumThickness = 270; inspectorItem.maximumThickness = 400
        inspectorItem.canCollapse = true
        addSplitViewItem(side); addSplitViewItem(content); addSplitViewItem(inspectorItem)
        splitView.dividerStyle = .thin
        splitView.autosaveName = "ClipboardLineLibraryColumns"
        inspectorItem.isCollapsed = !model.inspectorVisible
        model.$inspectorVisible.removeDuplicates().sink { [weak self] visible in
            guard let self, self.inspectorItem.isCollapsed == visible else { return }
            self.syncingInspector = true; defer { self.syncingInspector = false }
            self.inspectorItem.isCollapsed = !visible
        }.store(in: &subscriptions)
        model.$listMode.dropFirst().removeDuplicates().sink { model.store.defaults.set($0, forKey: "libraryListMode") }.store(in: &subscriptions)
        model.$inspectorVisible.dropFirst().removeDuplicates().sink { model.store.defaults.set($0, forKey: "libraryInspectorVisible") }.store(in: &subscriptions)
        inspectorItem.publisher(for: \.isCollapsed).dropFirst().sink { [weak self] collapsed in
            guard let self, !self.syncingInspector else { return }
            if self.model.inspectorVisible == collapsed { self.model.inspectorVisible = !collapsed }
        }.store(in: &subscriptions)
    }
    required init?(coder: NSCoder) { fatalError() }
}

private final class SidebarOutlineView: NSOutlineView {
    var menuAtRow: ((Int) -> NSMenu?)?
    override func menu(for event: NSEvent) -> NSMenu? { menuAtRow?(row(at: convert(event.locationInWindow, from: nil))) }
}

@MainActor final class LibrarySidebarNode: NSObject {
    let key: String
    let title: String
    let symbol: String
    let scope: LibraryQuery.Scope?
    let folder: LibraryCollection?
    let tag: LibraryTag?
    var children: [LibrarySidebarNode]
    init(_ key: String, _ title: String, _ symbol: String = "", scope: LibraryQuery.Scope? = nil, folder: LibraryCollection? = nil, tag: LibraryTag? = nil, children: [LibrarySidebarNode] = []) {
        self.key = key; self.title = title; self.symbol = symbol; self.scope = scope; self.folder = folder; self.tag = tag; self.children = children
    }
}

@MainActor final class LibrarySidebarController: NSViewController, NSOutlineViewDataSource, NSOutlineViewDelegate {
    let model: LibraryModel
    weak var actions: LibraryWindowController?
    private let outline = SidebarOutlineView()
    private var roots = [LibrarySidebarNode]()
    private var subscriptions = Set<AnyCancellable>()
    private var updating = false
    private var initialized = false
    init(model: LibraryModel, actions: LibraryWindowController) { self.model = model; self.actions = actions; super.init(nibName: nil, bundle: nil) }
    required init?(coder: NSCoder) { fatalError() }
    override func loadView() {
        let root = NSVisualEffectView(); root.material = .sidebar; root.blendingMode = .behindWindow; root.state = .followsWindowActiveState
        view = root
        let scroll = NSScrollView(); scroll.drawsBackground = false; scroll.hasVerticalScroller = true; scroll.autohidesScrollers = true
        let column = NSTableColumn(identifier: NSUserInterfaceItemIdentifier("LibrarySidebar"))
        outline.addTableColumn(column); outline.outlineTableColumn = column; outline.headerView = nil
        outline.style = .sourceList
        outline.rowSizeStyle = .default; outline.backgroundColor = .clear; outline.indentationPerLevel = 14
        outline.dataSource = self; outline.delegate = self; outline.focusRingType = .none
        outline.setAccessibilityLabel(L("Library"))
        outline.registerForDraggedTypes([NSPasteboard.PasteboardType("local.clipboardline.library-id")])
        outline.menuAtRow = { [weak self] in self?.menu(for: $0) }
        scroll.documentView = outline
        let add = NSButton(image: NSImage(systemSymbolName: "folder.badge.plus", accessibilityDescription: L("New folder"))!, target: self, action: #selector(newFolder))
        let settings = NSButton(image: NSImage(systemSymbolName: "gearshape", accessibilityDescription: L("Settings…"))!, target: self, action: #selector(openSettings))
        for button in [add, settings] { button.isBordered = false; button.bezelStyle = .inline; button.toolTip = button === add ? L("New folder") : L("Settings…") }
        let bottom = NSStackView(views: [add, NSView(), settings]); bottom.spacing = 10
        scroll.translatesAutoresizingMaskIntoConstraints = false; bottom.translatesAutoresizingMaskIntoConstraints = false
        root.addSubview(scroll); root.addSubview(bottom)
        NSLayoutConstraint.activate([scroll.leadingAnchor.constraint(equalTo: root.leadingAnchor), scroll.trailingAnchor.constraint(equalTo: root.trailingAnchor), scroll.topAnchor.constraint(equalTo: root.topAnchor), scroll.bottomAnchor.constraint(equalTo: bottom.topAnchor, constant: -10), bottom.leadingAnchor.constraint(equalTo: root.leadingAnchor, constant: 16), bottom.trailingAnchor.constraint(equalTo: root.trailingAnchor, constant: -16), bottom.bottomAnchor.constraint(equalTo: root.bottomAnchor, constant: -12), bottom.heightAnchor.constraint(equalToConstant: 24)])
        model.$collections.combineLatest(model.$tags).removeDuplicates { $0.0 == $1.0 && $0.1 == $1.1 }.sink { [weak self] folders, tags in self?.rebuild(folders, tags: tags) }.store(in: &subscriptions)
        model.$query.map(\.scope).removeDuplicates().sink { [weak self] scope in self?.select(scope) }.store(in: &subscriptions)
    }
    private func rebuild(_ folders: [LibraryCollection], tags: [LibraryTag]) {
        let expanded = initialized ? Set(allNodes.filter { outline.isItemExpanded($0) }.map(\.key)) : model.store.defaults.stringArray(forKey: "libraryExpandedSidebarNodes").map(Set.init)
        let library = LibrarySidebarNode("library", L("Library"), children: [
            LibrarySidebarNode("saved", L("My library"), "square.grid.2x2", scope: .saved),
            LibrarySidebarNode("favorites", L("Favorites"), "pin", scope: .favorites),
            LibrarySidebarNode("unorganized", L("Unorganized"), "tray", scope: .unorganized),
            LibrarySidebarNode("recent", L("Recent copies"), "clock", scope: .recent),
            LibrarySidebarNode("trash", L("Trash"), "trash", scope: .trash)])
        func folderNode(_ folder: LibraryCollection) -> LibrarySidebarNode { LibrarySidebarNode(folder.id.uuidString, folder.name, "folder", scope: .collection(folder.id), folder: folder) }
        let folderNodes = folders.filter { $0.parentID == nil }.map { parent -> LibrarySidebarNode in
            let node = folderNode(parent); node.children = folders.filter { $0.parentID == parent.id }.map(folderNode); return node
        }
        roots = [library, LibrarySidebarNode("folders", L("Folders"), children: folderNodes), LibrarySidebarNode("tags", L("Tags"), children: tags.map { LibrarySidebarNode($0.id.uuidString, $0.name, "number", scope: .tag($0.id), tag: $0) })]
        updating = true; outline.reloadData()
        for node in allNodes where expanded?.contains(node.key) ?? true { outline.expandItem(node) }
        initialized = true; updating = false; select(model.query.scope)
    }
    private var allNodes: [LibrarySidebarNode] { roots.flatMap { [$0] + $0.children.flatMap { [$0] + $0.children } } }
    private func select(_ scope: LibraryQuery.Scope) {
        guard let node = allNodes.first(where: { $0.scope == scope }) else { return }
        revealParents(of: node)
        let row = outline.row(forItem: node)
        guard row >= 0, outline.selectedRow != row else { return }
        updating = true; outline.selectRowIndexes(IndexSet(integer: row), byExtendingSelection: false); updating = false
    }
    private func revealParents(of node: LibrarySidebarNode) {
        guard let parent = allNodes.first(where: { $0.children.contains(where: { $0 === node }) }) else { return }
        revealParents(of: parent); outline.expandItem(parent)
    }
    func outlineView(_ outlineView: NSOutlineView, numberOfChildrenOfItem item: Any?) -> Int { (item as? LibrarySidebarNode)?.children.count ?? roots.count }
    func outlineView(_ outlineView: NSOutlineView, child index: Int, ofItem item: Any?) -> Any { ((item as? LibrarySidebarNode)?.children ?? roots)[index] }
    func outlineView(_ outlineView: NSOutlineView, isItemExpandable item: Any) -> Bool { !(item as! LibrarySidebarNode).children.isEmpty }
    func outlineView(_ outlineView: NSOutlineView, isGroupItem item: Any) -> Bool { (item as! LibrarySidebarNode).scope == nil }
    func outlineView(_ outlineView: NSOutlineView, shouldSelectItem item: Any) -> Bool { (item as! LibrarySidebarNode).scope != nil }
    func outlineView(_ outlineView: NSOutlineView, viewFor tableColumn: NSTableColumn?, item: Any) -> NSView? {
        let node = item as! LibrarySidebarNode
        let cell = NSTableCellView(); let label = NSTextField(labelWithString: node.title)
        label.font = node.scope == nil ? .systemFont(ofSize: 11, weight: .semibold) : .systemFont(ofSize: 13)
        if node.scope == nil { label.textColor = .secondaryLabelColor }
        label.lineBreakMode = .byTruncatingTail
        cell.textField = label; label.translatesAutoresizingMaskIntoConstraints = false; cell.addSubview(label)
        let icon = NSImageView(image: node.symbol.isEmpty ? NSImage() : NSImage(systemSymbolName: node.symbol, accessibilityDescription: nil) ?? NSImage())
        icon.contentTintColor = .controlAccentColor; cell.imageView = icon; icon.translatesAutoresizingMaskIntoConstraints = false; cell.addSubview(icon)
        NSLayoutConstraint.activate([icon.leadingAnchor.constraint(equalTo: cell.leadingAnchor, constant: 2), icon.centerYAnchor.constraint(equalTo: cell.centerYAnchor), icon.widthAnchor.constraint(equalToConstant: node.scope == nil ? 0 : 18), icon.heightAnchor.constraint(equalToConstant: 18), label.leadingAnchor.constraint(equalTo: icon.trailingAnchor, constant: node.scope == nil ? 0 : 7), label.trailingAnchor.constraint(equalTo: cell.trailingAnchor, constant: -4), label.centerYAnchor.constraint(equalTo: cell.centerYAnchor)])
        return cell
    }
    func outlineViewSelectionDidChange(_ notification: Notification) {
        guard !updating, let node = outline.item(atRow: outline.selectedRow) as? LibrarySidebarNode, let scope = node.scope else { return }
        model.changeScope(scope); if model.query.scope != scope { select(model.query.scope) }
    }
    func outlineViewItemDidExpand(_ notification: Notification) { saveExpansion() }
    func outlineViewItemDidCollapse(_ notification: Notification) { saveExpansion() }
    private func saveExpansion() {
        guard !updating else { return }
        model.store.defaults.set(allNodes.filter { outline.isItemExpanded($0) }.map(\.key), forKey: "libraryExpandedSidebarNodes")
    }
    func outlineView(_ outlineView: NSOutlineView, validateDrop info: NSDraggingInfo, proposedItem item: Any?, proposedChildIndex index: Int) -> NSDragOperation {
        guard (item as? LibrarySidebarNode)?.folder != nil else { return [] }
        outlineView.setDropItem(item, dropChildIndex: NSOutlineViewDropOnItemIndex); return .copy
    }
    func outlineView(_ outlineView: NSOutlineView, acceptDrop info: NSDraggingInfo, item: Any?, childIndex index: Int) -> Bool {
        guard let folder = (item as? LibrarySidebarNode)?.folder else { return false }
        let ids = (info.draggingPasteboard.pasteboardItems ?? []).compactMap { $0.string(forType: NSPasteboard.PasteboardType("local.clipboardline.library-id")) }.compactMap(UUID.init(uuidString:))
        guard !ids.isEmpty, model.flushEdits() else { return false }
        do { try model.store.assign(ids, to: folder.id); return true } catch { model.report(error.localizedDescription); return false }
    }
    private func menu(for row: Int) -> NSMenu {
        let menu = NSMenu(); menu.addItem(ClosureMenuItem(L("New folder")) { [weak self] in self?.actions?.createFolder() })
        if let node = outline.item(atRow: row) as? LibrarySidebarNode {
            if let folder = node.folder {
                if folder.parentID == nil { menu.addItem(ClosureMenuItem(L("New subfolder")) { [weak self] in self?.actions?.createFolder(parent: folder.id) }) }
                menu.addItem(ClosureMenuItem(L("Rename folder")) { [weak self] in self?.actions?.renameFolder(folder) })
                menu.addItem(ClosureMenuItem(L("Remove folder")) { [weak self] in self?.actions?.removeFolder(folder) })
            }
            if let tag = node.tag {
                menu.addItem(ClosureMenuItem(L("Rename tag")) { [weak self] in self?.actions?.renameTag(tag) })
                menu.addItem(ClosureMenuItem(L("Remove tag")) { [weak self] in self?.actions?.removeTag(tag) })
            }
        }
        return menu
    }
    @objc private func newFolder() { actions?.createFolder() }
    @objc private func openSettings() { actions?.onSettings?() }
}
