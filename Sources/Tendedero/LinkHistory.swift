import AppKit
import Combine

@MainActor final class LinkHistory: ObservableObject {
    static var isEnabled: Bool {
        get { UserDefaults.standard.object(forKey: "linkClipboardEnabled") as? Bool ?? true }
        set { UserDefaults.standard.set(newValue, forKey: "linkClipboardEnabled") }
    }
    @Published private(set) var entries = [LibraryRecord]()
    @Published private(set) var favoritesOnly = false
    @Published private(set) var searchMatchingIDs: Set<UUID>?
    @Published private(set) var selectedIDs = Set<UUID>()
    @Published private(set) var focusedID: UUID?
    @Published private(set) var selecting = false
    @Published private(set) var scrollOffset: CGFloat = 0
    @Published private(set) var copiedIDs = Set<UUID>()
    @Published var notice: String?
    let thumbnails = ThumbnailStore()
    let store: LibraryStore?
    private var subscription: AnyCancellable?
    private var anchor: UUID?
    private var feedbackGeneration = 0
    private let copyOverride: ((String) -> Void)?
    var displayEntries: [LibraryRecord] {
        entries.filter { (!favoritesOnly || $0.favorite) && (searchMatchingIDs?.contains($0.id) ?? true) }
    }
    func setSearchMatchingIDs(_ ids: Set<UUID>?, width: CGFloat) {
        guard searchMatchingIDs != ids else { return }
        searchMatchingIDs = ids; sanitize(); scroll(0, width: width)
    }
    var selectedEntries: [LibraryRecord] { displayEntries.filter { selectedIDs.contains($0.id) } }
    init(store: LibraryStore?, copy: ((String) -> Void)? = nil) {
        self.store = store; copyOverride = copy
        reload()
        subscription = store?.$revision.dropFirst().sink { [weak self, weak store] _ in if store?.changedKinds.contains(.link) == true { self?.reload() } }
        thumbnails.onLoad = { [weak self] in self?.objectWillChange.send() }
    }
    private func reload() {
        guard let store else { return }
        do {
            let values = try store.shelfItems(.link)
            if entries != values { entries = values; sanitize() }
        } catch { notice = error.localizedDescription }
    }
    @discardableResult func add(_ url: URL) -> LibraryRecord? {
        do { let value = try store?.captureLink(url); scrollOffset = 0; return value }
        catch { notice = error.localizedDescription; return nil }
    }
    func setFavoritesOnly(_ value: Bool) { favoritesOnly = value; scrollOffset = 0; cancelSelection() }
    func cancelSelection() { selectedIDs.removeAll(); focusedID = nil; anchor = nil; selecting = false }
    func selectAll() { selectedIDs = Set(displayEntries.map(\.id)); focusedID = displayEntries.first?.id; anchor = focusedID; selecting = true }
    func select(_ id: UUID, toggle: Bool = false, extending: Bool = false, preservingSelection: Bool = false, width: CGFloat) {
        let displayed = displayEntries
        guard let index = displayed.firstIndex(where: { $0.id == id }) else { return }
        if extending, let anchor, let start = displayed.firstIndex(where: { $0.id == anchor }) {
            selectedIDs = Set(displayed[min(start, index)...max(start, index)].map(\.id))
        } else if toggle { if !selectedIDs.insert(id).inserted { selectedIDs.remove(id) }; anchor = id }
        else if !preservingSelection || !selectedIDs.contains(id) { selectedIDs = [id]; anchor = id }
        focusedID = id; if toggle || extending { selecting = true }
        let left = Layout.x(index: index) - Layout.cardWidth / 2
        if left < scrollOffset { scrollOffset = max(0, left - Layout.edgePadding) }
        if left + Layout.cardWidth > scrollOffset + width { scrollOffset = left + Layout.cardWidth + Layout.edgePadding - width }
        scroll(0, width: width)
    }
    func moveSelection(_ delta: Int, width: CGFloat, extending: Bool = false) {
        guard !displayEntries.isEmpty else { return }
        let index = focusedID.flatMap { id in displayEntries.firstIndex { $0.id == id } }
        let target = index.map { min(displayEntries.count - 1, max(0, $0 + delta)) } ?? 0
        select(displayEntries[target].id, extending: extending, width: width)
    }
    func scroll(_ delta: CGFloat, width: CGFloat) {
        guard delta.isFinite else { return }
        scrollOffset = max(0, min(Layout.maximumOffset(count: displayEntries.count, width: width), scrollOffset - delta))
    }
    func actionEntries(_ id: UUID) -> [LibraryRecord] { selectedIDs.contains(id) && selectedEntries.count > 1 ? selectedEntries : entries.filter { $0.id == id } }
    func togglePin(_ id: UUID) { perform { try store?.toggleFavorite([id]) } }
    func removeFromShelf(_ id: UUID) { perform { try store?.removeFromShelf([id]) } }
    func trash(_ ids: [UUID]) { perform { try store?.trash(ids) } }
    @discardableResult func copy(_ id: UUID) -> Bool { copyEntries(entries.filter { $0.id == id }) }
    func copyAction(_ id: UUID) { copyEntries(actionEntries(id)) }
    @discardableResult func copySelection() -> Bool { copyEntries(selectedEntries) }
    @discardableResult func copyEntries(_ values: [LibraryRecord], to board: NSPasteboard? = nil) -> Bool {
        guard !values.isEmpty else { return false }
        let urls = values.compactMap(\.originalURL)
        guard urls.count == values.count else { return false }
        if let copyOverride, board == nil { copyOverride(urls.joined(separator: "\n\n")) }
        else if !ClipboardTransfer.write(ClipboardTransfer.linkItems(urls), to: board ?? .general) { notice = L("Could not copy selected items"); return false }
        perform { try store?.markCopied(values.map(\.id)) }
        copiedIDs = Set(values.map(\.id)); feedbackGeneration += 1; let generation = feedbackGeneration
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) { [weak self] in if self?.feedbackGeneration == generation { self?.copiedIDs.removeAll() } }
        return true
    }
    func dragItems(_ id: UUID) -> [ShelfDragItem] {
        guard let store else { return [] }
        do { return try LibraryTransfer.dragItems(actionEntries(id), store: store) }
        catch { notice = error.localizedDescription; return [] }
    }
    private func perform(_ action: () throws -> Void) { do { try action() } catch { notice = error.localizedDescription } }
    private func sanitize() {
        let ids = Set(displayEntries.map(\.id)); selectedIDs.formIntersection(ids)
        if let focusedID, !ids.contains(focusedID) { self.focusedID = nil }
        if let anchor, !ids.contains(anchor) { self.anchor = nil }
    }
}
