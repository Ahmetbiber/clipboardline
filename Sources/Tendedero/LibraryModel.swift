import AppKit
import Combine

@MainActor final class LibraryModel: ObservableObject {
    let store: LibraryStore
    let copyPasteboard: NSPasteboard
    let keyboardBindings: KeyboardBindings
    @Published private(set) var query = LibraryQuery()
    @Published private(set) var ids = [UUID]()
    @Published private(set) var selectedIDs = Set<UUID>()
    @Published private(set) var focusedID: UUID?
    @Published private(set) var collections = [LibraryCollection]()
    @Published private(set) var tags = [LibraryTag]()
    @Published private(set) var loading = false
    @Published private(set) var notice: String?
    @Published private(set) var copiedIDs = Set<UUID>()
    @Published private(set) var imageSearchStatus = ""
    @Published var listMode = false
    @Published var inspectorVisible = true
    @Published var search = "" { didSet { debounceSearch() } }
    @Published var draftTitle = "" { didSet { scheduleSave() } }
    @Published var draftText = "" { didSet { scheduleSave() } }
    @Published var draftNote = "" { didSet { scheduleSave() } }
    @Published private(set) var inspected: LibraryRecord?
    @Published private(set) var inspectedCollections = [LibraryCollection]()
    @Published private(set) var inspectedTags = [LibraryTag]()
    var columns = 4
    var onPreview: ((UUID) -> Void)?
    var onSearchFocus: (() -> Void)?
    var onSearchEscape: (() -> Bool)?
    var onContentFocus: (() -> Void)?
    var onTagRequested: (() -> Void)?
    var onPinToFolderRequested: (([UUID]) -> Void)?
    var onNameAndPinRequested: ((UUID) -> Void)?
    var onNameAndPinBatchRequested: (([UUID]) -> Void)?
    var onPasteRequested: (([UUID]) -> Void)?
    var onImageTextCopyRequested: ((UUID) -> Void)?
    var onCommandsRequested: (() -> Void)?
    var onSelectionReveal: ((UUID) -> Void)?
    var onRecordsChanged: (([UUID]) -> Void)?
    var onVisibleLinks: (([UUID]) -> Void)?
    var thumbnailStats: (() -> ThumbnailStore.Stats?)?
    var collectionStats: (() -> (configurations: Int, refreshes: Int)?)?
    var onExportRequested: (() -> Void)?
    var onTrashRequested: (() -> Void)?
    var onCloseRequested: (() -> Void)?
    var onFlushPreview: () -> Bool = { true }
    private var flushingPreview = false
    private var subscription: AnyCancellable?
    private var noticeSubscription: AnyCancellable?
    private var searchSubscription: AnyCancellable?
    private var imageStatusSubscription: AnyCancellable?
    private(set) var updatesSuspended = false
    private(set) var reloadCount = 0
    private var resetOnResume = false
    private var queryGeneration = 0
    private var pendingQuery: DispatchWorkItem?
    private var pendingSave: DispatchWorkItem?
    private var loadingDraft = false
    private var dirty = false
    private var anchor: UUID?
    private var indices = [UUID: Int]()
    private var pages = [Int: [LibraryCardSummary]]()
    private var pageOrder = [Int]()
    private var wantedPages = [Int]()
    private var runningPages = Set<Int>()
    private var feedbackGeneration = 0
    private struct PendingDetailsSelection {
        let id: UUID
        let query: LibraryQuery
        let mayBroaden: Bool
    }
    private var pendingDetailsSelection: PendingDetailsSelection?
    static let pageSize = 80
    var cachedSummaryCount: Int { pages.values.reduce(0) { $0 + $1.count } }
    var pendingPageCount: Int { runningPages.count }
    init(store: LibraryStore, copyPasteboard: NSPasteboard? = nil) {
        self.store = store
        keyboardBindings = KeyboardBindings(defaults: store.defaults)
        self.copyPasteboard = copyPasteboard ?? .general
        listMode = store.defaults.bool(forKey: "libraryListMode")
        inspectorVisible = store.defaults.object(forKey: "libraryInspectorVisible") as? Bool ?? true
        subscription = store.$revision.dropFirst().sink { [weak self] _ in self?.reload() }
        noticeSubscription = store.$notice.dropFirst().sink { [weak self] in if let notice = $0 { self?.notice = notice } }
        searchSubscription = store.$searchRevision.dropFirst().sink { [weak self] _ in guard let self, !self.search.isEmpty else { return }; self.reload() }
        imageStatusSubscription = store.$imageSearchStatus.sink { [weak self] status in
            guard let self, !self.updatesSuspended, self.imageSearchStatus != status else { return }
            self.imageSearchStatus = status
        }
        reload()
    }
    var title: String {
        switch query.scope {
        case .saved: L("My library"); case .favorites: L("Favorites"); case .unorganized: L("Unorganized")
        case .recent, .shelf: L("Recent copies"); case .trash: L("Trash")
        case let .collection(id): collections.first { $0.id == id }?.name ?? L("Folder")
        case let .tag(id): "#" + (tags.first { $0.id == id }?.name ?? L("Tag"))
        }
    }
    func clearNotice() { notice = nil; store.notice = nil }
    func report(_ message: String) { notice = message }
    /// Keep capture and indexing in the shared store alive, but stop work for a
    /// closed Library. In-flight read completions are discarded by generation.
    @discardableResult func suspendUpdates() -> Bool {
        guard !updatesSuspended else { return true }
        guard flushEdits() else { return false }
        updatesSuspended = true; queryGeneration += 1; pendingDetailsSelection = nil
        pendingQuery?.cancel(); pendingQuery = nil
        pages.removeAll(); pageOrder.removeAll(); wantedPages.removeAll(); runningPages.removeAll()
        return true
    }
    func resumeUpdates() {
        guard flushEdits() else { return }
        updatesSuspended = false
        let searchChanged = applyPendingSearch(), reset = resetOnResume || searchChanged
        resetOnResume = false
        if imageSearchStatus != store.imageSearchStatus { imageSearchStatus = store.imageSearchStatus }
        reload(reset: reset)
    }
    @discardableResult private func applyPendingSearch() -> Bool {
        guard query.search != search else { return false }
        if query.search.isEmpty && !search.isEmpty && query.sort == .newest { query.sort = .relevance }
        if search.isEmpty && query.sort == .relevance { query.sort = .newest }
        query.search = search; return true
    }
    private func debounceSearch() {
        pendingQuery?.cancel()
        guard !updatesSuspended else { resetOnResume = resetOnResume || query.search != search; return }
        guard query.search != search else { return }
        let work = DispatchWorkItem { [weak self] in
            guard let self, !self.updatesSuspended, self.query.search != self.search, self.flushEdits() else { return }
            self.applyPendingSearch(); self.reload(reset: true)
        }
        pendingQuery = work; DispatchQueue.main.asyncAfter(deadline: .now() + 0.18, execute: work)
    }
    func changeScope(_ value: LibraryQuery.Scope) {
        guard flushEdits() else { return }; query.scope = value; reload(reset: true)
    }
    func setKind(_ value: LibraryKind?) { guard flushEdits() else { return }; query.kind = value; reload(reset: true) }
    func setSort(_ value: LibraryQuery.Sort) { guard flushEdits() else { return }; query.sort = value; reload() }
    func setSearchMode(_ value: LibraryQuery.SearchMode) { guard flushEdits() else { return }; query.searchMode = value; reload(reset: true) }
    func setFavorites(_ value: Bool) { guard flushEdits() else { return }; query.favoritesOnly = value; reload(reset: true) }
    var showingPinnedOnly: Bool { query.scope == .favorites || query.favoritesOnly }
    func togglePinnedOnly() {
        guard flushEdits() else { return }
        if query.scope == .favorites { query.scope = .saved; query.favoritesOnly = false; reload(reset: true) }
        else { setFavorites(!query.favoritesOnly) }
    }
    func setDays(_ value: Int?) { guard flushEdits() else { return }; query.days = value; reload(reset: true) }
    func setDomain(_ value: String) { guard flushEdits() else { return }; query.domain = value.trimmingCharacters(in: .whitespacesAndNewlines); reload(reset: true) }
    func toggleTagFilter(_ id: UUID) { guard flushEdits() else { return }; if !query.tagIDs.insert(id).inserted { query.tagIDs.remove(id) }; reload(reset: true) }
    func clearFilters() {
        guard flushEdits() else { return }
        query.kind = nil; query.favoritesOnly = false; query.tagIDs.removeAll(); query.days = nil; query.domain = ""
        search = ""; applyPendingSearch(); pendingQuery?.cancel(); pendingQuery = nil
        query.searchMode = .all; reload(reset: true)
    }
    /// A command can refer to a shelf item outside this Library's last filter.
    /// Keep a matching view intact, otherwise reveal it in the appropriate
    /// saved/recent/Trash scope after the current generation finishes loading.
    func revealItemDetails(_ id: UUID) {
        guard flushEdits(), let record = try? store.item(id) else { return }
        inspectorVisible = true
        if indices[id] != nil {
            if loading { pendingDetailsSelection = PendingDetailsSelection(id: id, query: query, mayBroaden: true) }
            else { _ = select(id); onContentFocus?() }
        } else { broadenDetailsQuery(record) }
    }
    private func broadenDetailsQuery(_ record: LibraryRecord) {
        query = LibraryQuery(scope: record.deletedAt != nil ? .trash : record.retainedAt != nil ? .saved : .recent)
        search = ""; pendingQuery?.cancel(); pendingQuery = nil
        pendingDetailsSelection = PendingDetailsSelection(id: record.id, query: query, mayBroaden: false)
        reload(reset: true)
    }
    private func finishDetailsSelection() {
        guard let pending = pendingDetailsSelection else { return }
        pendingDetailsSelection = nil
        var expected = pending.query, actual = query
        // Image-analysis results may refresh independently of the user's view.
        expected.visualIDs = []; actual.visualIDs = []
        guard expected == actual, search == query.search else { return }
        if indices[pending.id] != nil {
            if select(pending.id) { inspectorVisible = true; onContentFocus?() }
        } else if pending.mayBroaden, let record = try? store.item(pending.id) {
            // At most one broader reload: an in-flight filtered query may have
            // removed the item from the old IDs observed when the command ran.
            broadenDetailsQuery(record)
        }
    }
    func reload(reset: Bool = false) {
        guard !updatesSuspended else { resetOnResume = resetOnResume || reset; return }
        reloadCount += 1
        queryGeneration += 1; let generation = queryGeneration
        let changes = store.changedIDs
        runningPages.removeAll()
        if reset || changes.isEmpty { pages.removeAll(); pageOrder.removeAll() }
        else { for id in changes { if let index = indices[id] { pages[index / Self.pageSize] = nil } } }
        loading = true
        do {
            let folders = try store.collections(), labels = try store.tags()
            if collections != folders { collections = folders }
            if tags != labels { tags = labels }
        } catch { notice = error.localizedDescription }
        store.resolveImageSearch(query) { [weak self] resolved in
          guard let self, generation == self.queryGeneration else { return }
          self.query = resolved
          self.store.queryIDsAsync(resolved) { [weak self] result in
            guard let self, generation == self.queryGeneration else { return }
            self.loading = false
            switch result {
            case let .success(ids):
                let differentIDs = self.ids != ids
                if differentIDs { self.pages.removeAll(); self.pageOrder.removeAll() }
                if differentIDs {
                    self.ids = ids; self.indices = Dictionary(uniqueKeysWithValues: ids.enumerated().map { ($1, $0) })
                    let selected = self.selectedIDs.intersection(Set(ids))
                    if selected != self.selectedIDs { self.selectedIDs = selected }
                }
                if let id = self.focusedID, self.indices[id] == nil, self.flushEdits() {
                    self.focusedID = nil; self.anchor = nil; _ = self.inspect(nil)
                }
                if reset { self.selectedIDs.removeAll(); self.focusedID = nil; self.anchor = nil; _ = self.inspect(nil) }
                if self.wantedPages.isEmpty || differentIDs || reset { self.requestVisible(Array(ids.prefix(Self.pageSize))) } else { self.schedulePages() }
                self.onRecordsChanged?(ids)
                // Revisions update sidebar metadata without destroying an editor.
                if !self.dirty, let id = self.focusedID { _ = self.inspect(id) }
                self.finishDetailsSelection()
            case let .failure(error): self.pendingDetailsSelection = nil; self.notice = error.localizedDescription
            }
          }
        }
    }
    func summary(_ id: UUID) -> LibraryRecord? {
        cardSummary(id)?.record
    }
    func index(of id: UUID) -> Int? { indices[id] }
    func cardSummary(_ id: UUID) -> LibraryCardSummary? {
        guard let index = indices[id], let page = pages[index / Self.pageSize] else { return nil }
        let offset = index % Self.pageSize
        guard offset < page.count, page[offset].record.id == id else { return nil }
        return page[offset]
    }
    func requestVisible(_ ids: [UUID]) {
        guard !updatesSuspended else { return }
        var seen = Set<Int>()
        wantedPages = ids.compactMap { indices[$0].map { $0 / Self.pageSize } }.filter { seen.insert($0).inserted }
        schedulePages()
    }
    private func schedulePages() {
        guard !updatesSuspended else { return }
        for page in wantedPages {
            guard runningPages.count < 2 else { return }
            guard pages[page] == nil, !runningPages.contains(page) else { continue }
            runningPages.insert(page); let generation = queryGeneration
            store.cardSummariesAsync(query, limit: Self.pageSize, offset: page * Self.pageSize) { [weak self] result in
                guard let self, generation == self.queryGeneration else { return }
                self.runningPages.remove(page)
                switch result {
                case let .success(summaries):
                    // Grid summaries stay small even when a note is one megabyte.
                    self.pages[page] = summaries.map { summary in var value = summary; value.record.text = summary.record.text.map { String($0.prefix(500)) }; value.record.note = ""; return value }
                    self.pageOrder.removeAll { $0 == page }; self.pageOrder.append(page)
                    while self.pageOrder.count > 12 { self.pages.removeValue(forKey: self.pageOrder.removeFirst()) }
                    let records = summaries.map(\.record)
                    self.onRecordsChanged?(records.map(\.id)); self.onVisibleLinks?(records.filter { $0.kind == .link }.map(\.id))
                case let .failure(error): self.notice = error.localizedDescription; self.wantedPages.removeAll { $0 == page }
                }
                self.schedulePages()
            }
        }
    }
    @discardableResult func select(_ id: UUID, toggle: Bool = false, extending: Bool = false, preservingSelection: Bool = false) -> Bool {
        guard let target = indices[id], id == focusedID || flushEdits() else { return false }
        pendingDetailsSelection = nil
        if extending, let anchor, let start = indices[anchor] { selectedIDs = Set(ids[min(start,target)...max(start,target)]) }
        else if toggle { if !selectedIDs.insert(id).inserted { selectedIDs.remove(id) }; anchor = id }
        else if !preservingSelection || !selectedIDs.contains(id) { selectedIDs = [id]; anchor = id }
        focusedID = id; if inspected?.id != id { _ = inspect(id) }; onSelectionReveal?(id); return true
    }
    func selectAll() { selectedIDs = Set(ids); if focusedID == nil, let first = ids.first { focusedID = first; anchor = first; _ = inspect(first) } }
    func acceptNativeSelection(_ selection: Set<UUID>, focused: UUID?) -> Bool {
        guard focused == focusedID || flushEdits() else { return false }
        selectedIDs = selection.intersection(Set(ids)); focusedID = focused; anchor = focused
        if inspected?.id != focused { _ = inspect(focused) }; return true
    }
    func move(_ delta: Int, extending: Bool = false) {
        guard !ids.isEmpty else { return }
        let target = focusedID.flatMap { indices[$0] }.map { max(0, min(ids.count - 1, $0 + delta)) } ?? 0
        _ = select(ids[target], extending: extending)
    }
    var actionIDs: [UUID] {
        if selectedIDs.isEmpty { return focusedID.map { [$0] } ?? [] }
        if selectedIDs.count == ids.count { return ids }
        return selectedIDs.filter { indices[$0] != nil }.sorted { indices[$0]! < indices[$1]! }
    }
    func copy(to board: NSPasteboard? = nil) {
        guard flushEdits(), !actionIDs.isEmpty else { return }
        copyRecords(actionIDs, to: board ?? copyPasteboard)
    }
    func copyCurrent(_ id: UUID) { guard flushEdits() else { return }; copyRecords([id], to: copyPasteboard) }
    func dragItems(_ id: UUID) -> [ShelfDragItem] {
        guard flushEdits(), selectedIDs.contains(id) || select(id) else { return [] }
        do { return try LibraryTransfer.dragItems(store.records(actionIDs), store: store) }
        catch { notice = error.localizedDescription; return [] }
    }
    private func copyRecords(_ selected: [UUID], to board: NSPasteboard) {
        perform {
            let ids = selected, items = try LibraryTransfer.pasteboardItems(store.records(ids))
            guard ClipboardTransfer.write(items, to: board) else { throw HistoryFiles.Failure.unsafeFile }
            try store.markCopied(ids)
            copiedIDs = Set(ids); feedbackGeneration += 1; let generation = feedbackGeneration
            notice = ids.count == 1 ? L("Copied") : String(format: L("%d items copied"), ids.count)
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) { [weak self] in if self?.feedbackGeneration == generation { self?.copiedIDs.removeAll() } }
        }
    }
    func favorite() { guard flushEdits() else { return }; perform { try store.toggleFavorite(actionIDs) } }
    func retain() { guard flushEdits() else { return }; perform { try store.retain(actionIDs) } }
    func trash() { guard flushEdits() else { return }; perform { try store.trash(actionIDs) } }
    func restore() { perform { try store.restore(actionIDs) } }
    func assign(_ folder: UUID, moving: Bool = false) {
        guard flushEdits() else { return }
        var source: UUID?; if moving, case let .collection(id) = query.scope { source = id }
        perform { try store.assign(actionIDs, to: folder, movingFrom: source) }
    }
    func addTag(_ name: String) { guard flushEdits() else { return }; perform { try store.addTag(name, to: actionIDs) } }
    func unassign(_ folder: UUID) { guard flushEdits(), let id = inspected?.id else { return }; perform { try store.unassign(id, from: folder) } }
    func removeTag(_ tag: UUID) { guard flushEdits(), let id = inspected?.id else { return }; perform { try store.removeTag(tag, from: id) } }
    func open() { guard let id = focusedID, let record = try? store.item(id), let url = record.linkURL ?? record.fileURL else { return }; NSWorkspace.shared.open(url) }
    func newNote() { guard flushEdits() else { return }; perform { let note = try store.createNote(); query = LibraryQuery(scope: .saved, kind: .text); search = ""; pendingQuery?.cancel(); inspectorVisible = true; focusedID = note.id; selectedIDs = [note.id]; _ = inspect(note.id); reload() } }
    func perform(_ action: () throws -> Void) { do { try action() } catch { notice = error.localizedDescription } }
    @discardableResult private func inspect(_ id: UUID?) -> Bool {
        if inspected?.id != id, !flushEdits() { return false }
        loadingDraft = true; defer { loadingDraft = false }
        inspected = id.flatMap { try? store.item($0) }
        inspectedCollections = id.flatMap { try? store.collections(for: $0) } ?? []
        inspectedTags = id.flatMap { try? store.tags(for: $0) } ?? []
        draftTitle = inspected?.title ?? ""; draftText = inspected?.text ?? ""; draftNote = inspected?.note ?? ""
        dirty = false; return true
    }
    private func scheduleSave() {
        guard !loadingDraft, inspected != nil else { return }
        dirty = true; pendingSave?.cancel()
        let work = DispatchWorkItem { [weak self] in _ = self?.flushEdits() }; pendingSave = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3, execute: work)
    }
    @discardableResult func flushEdits() -> Bool {
        if !flushingPreview {
            flushingPreview = true
            defer { flushingPreview = false }
            guard onFlushPreview() else { return false }
        }
        pendingSave?.cancel(); pendingSave = nil
        guard dirty, let record = inspected else { return true }
        do {
            let title = draftTitle, text = draftText, note = draftNote
            // Clear before publishing the transaction, so synchronous observers
            // cannot attempt to save the same draft recursively.
            dirty = false
            try store.update(record.id) { $0.title = title; $0.note = note; if $0.kind == .text { $0.text = text } }
            return true
        } catch { dirty = true; notice = L("Changes could not be saved; keep this draft open"); return false }
    }
    func handleKey(_ event: NSEvent, editing: Bool) -> Bool {
        let action = keyboardBindings.action(for: event, in: .library)
        if action == .commandPalette, !editing || !event.modifierFlags.intersection([.command, .control]).isEmpty { return perform(.commandPalette) }
        if action == .search, !editing || !event.modifierFlags.intersection([.command, .control]).isEmpty { onSearchFocus?(); return true }
        if event.keyCode == 53, event.modifierFlags.intersection([.command, .shift, .control, .option]).isEmpty, onSearchEscape?() == true { return true }
        guard !editing, let action else { return false }
        return perform(action)
    }
    /// Execute a chosen action without manufacturing a keyboard event. Native
    /// editor guards stay in handleKey; explicit commands share the same route.
    @discardableResult func perform(_ action: KeyboardAction) -> Bool {
        switch action {
        case .paste: if flushEdits() { onPasteRequested?(actionIDs) }
        case .copyImageText: if let focusedID { onImageTextCopyRequested?(focusedID) }
        case .commandPalette: onCommandsRequested?()
        case .search: onSearchFocus?()
        case .selectAll: selectAll()
        case .copy: copy()
        case .pin: favorite()
        case .pinToFolder: if flushEdits(), !actionIDs.isEmpty { onPinToFolderRequested?(actionIDs) }
        case .nameAndPin:
            // actionIDs uses the current filtered/sorted visible order, never Set order.
            if flushEdits(), !actionIDs.isEmpty { onNameAndPinBatchRequested?(actionIDs) }
        case .pinnedOnly: togglePinnedOnly()
        case .open: open()
        case .allTypes: setKind(nil)
        case .images: setKind(.image)
        case .texts: setKind(.text)
        case .links: setKind(.link)
        case .tag: onTagRequested?()
        case .export: onExportRequested?()
        case .trash: onTrashRequested?()
        case .previous: move(-1)
        case .next: move(1)
        case .up: move(listMode ? -1 : -max(1, columns))
        case .down: move(listMode ? 1 : max(1, columns))
        case .extendPrevious: move(-1, extending: true)
        case .extendNext: move(1, extending: true)
        case .extendUp: move(listMode ? -1 : -max(1, columns), extending: true)
        case .extendDown: move(listMode ? 1 : max(1, columns), extending: true)
        case .preview: if let id = focusedID { onPreview?(id) }
        case .close: guard let onCloseRequested else { return false }; onCloseRequested()
        default: return false
        }
        return true
    }
}
