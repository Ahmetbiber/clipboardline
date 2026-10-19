import SwiftUI

struct LinkShelfView: View {
    @ObservedObject var line: Line
    @ObservedObject var links: LinkHistory
    let width: CGFloat
    var body: some View {
        let entries = links.displayEntries
        let quickNumbers = line.activeShelf == .links && line.searchEditingShelf == nil
            ? Dictionary(uniqueKeysWithValues: line.quickSelectionIDs.enumerated().map { ($0.element, $0.offset + 1) }) : [:]
        let range = Layout.visibleRange(count: entries.count, width: width, offset: links.scrollOffset)
        ZStack(alignment: .topLeading) {
            if entries.isEmpty {
                Text(line.shelfSearch?.isActive(for: .link) == true ? L("No matching items") : links.favoritesOnly ? L("No matching items") + " · " + line.keyboardBindings.title(.pinnedOnly) : L("Copied web addresses appear here when link capture is enabled"))
                    .font(.system(size: 12)).padding(9).background(.regularMaterial, in: Capsule()).position(x: width / 2, y: 95)
            }
            ForEach(range.map { entries[$0] }) { entry in
                let index = entries.firstIndex { $0.id == entry.id } ?? 0
                LinkCard(entry: entry, line: line, links: links, quickNumber: quickNumbers[entry.id])
                    .position(x: Layout.x(index: index, scrollOffset: links.scrollOffset),
                        y: Layout.ropeY(x: Layout.x(index: index, scrollOffset: links.scrollOffset), width: width) - Layout.pinAbove + (18 + 112 * Layout.scale) / 2)
            }
        }.onAppear { requestThumbnails(entries, range) }
            .onChange(of: range) { _, value in requestThumbnails(entries, value) }
            .onChange(of: entries) { _, value in requestThumbnails(value, Layout.visibleRange(count: value.count, width: width, offset: links.scrollOffset)) }
    }
    private func requestThumbnails(_ entries: [LibraryRecord], _ range: Range<Int>) {
        links.thumbnails.request(range.compactMap { entries[$0].thumbnailPath.map { URL(fileURLWithPath: $0) } }, pixels: 320)
        line.onLinkItemsVisible?(range.map { entries[$0].id })
    }
}

private struct LinkCard: View {
    let entry: LibraryRecord
    @ObservedObject var line: Line
    @ObservedObject var links: LinkHistory
    let quickNumber: Int?
    @State private var hovering = false
    private var thumbnail: NSImage? { entry.thumbnailPath.flatMap { links.thumbnails.image(for: URL(fileURLWithPath: $0), pixels: 320) } }
    var body: some View {
        VStack(spacing: -8) {
            Clothespin().zIndex(1)
            VStack(alignment: .leading, spacing: 5 * Layout.scale) {
                ZStack {
                    line.theme.wash(.links)
                    if let thumbnail { Image(nsImage: thumbnail).resizable().scaledToFit() }
                    else { Image(systemName: LinkIdentity.youtubeID(entry.linkURL ?? URL(string: "https://invalid.example")!) == nil ? "link" : "play.rectangle").font(.system(size: 24)).foregroundStyle(.secondary) }
                }.frame(width: Layout.cardWidth - 16 * Layout.scale, height: 38 * Layout.scale).clipped().clipShape(RoundedRectangle(cornerRadius: 8))
                Text(entry.displayTitle).font(.system(size: 10 * Layout.scale, weight: .semibold)).lineLimit(2).frame(height: 26 * Layout.scale, alignment: .topLeading)
                Text(entry.author ?? entry.linkURL?.host ?? L("Link")).font(.system(size: 9 * Layout.scale)).foregroundStyle(.secondary).lineLimit(1)
            }.padding(8 * Layout.scale).padding(.top, 12 * Layout.scale).frame(width: Layout.cardWidth, alignment: .leading)
                .background(.regularMaterial, in: RoundedRectangle(cornerRadius: Frame.radius))
                .background(line.theme.wash(.links), in: RoundedRectangle(cornerRadius: Frame.radius))
                .overlay(RoundedRectangle(cornerRadius: Frame.radius).strokeBorder(links.selectedIDs.contains(entry.id) ? Color.accentColor : .clear, lineWidth: 3))
                .overlay(alignment: .topLeading) { Image(systemName: "xmark").font(.system(size: 8, weight: .bold)).frame(width: 20, height: 20).glassFrame(circle: true).padding(3).opacity(hovering ? 1 : 0).allowsHitTesting(false) }
                .overlay(alignment: .topTrailing) { FavoriteBadge(pinned: entry.favorite, visible: hovering || links.focusedID == entry.id) }
                .overlay(LinkGrabArea(entry: entry, line: line, links: links))
                .overlay(alignment: .bottomLeading) { QuickSelectionBadge(number: quickNumber) }
                .overlay(alignment: .bottom) { if links.copiedIDs.contains(entry.id) { CopyBadge(title: L("Link copied")) } }
                .shadow(color: .black.opacity(0.18), radius: hovering ? 14 : 10, y: 5)
                .onHover { hovering = $0 }
        }.accessibilityElement(children: .ignore).accessibilityLabel(entry.displayTitle)
            .background(GeometryReader { geo in Color.clear.preference(key: HitRectsKey.self, value: [entry.id: geo.frame(in: .global)]) })
    }
}

private struct LinkGrabArea: NSViewRepresentable {
    let entry: LibraryRecord
    let line: Line
    let links: LinkHistory
    func makeNSView(context: Context) -> GrabView { let view = GrabView(); configure(view); return view }
    func updateNSView(_ view: GrabView, context: Context) { configure(view) }
    private func configure(_ view: GrabView) {
        let id = entry.id
        view.selectionMode = links.selecting; view.appCopy = true; view.allowsMove = false
        view.payloadProvider = { links.dragItems(id) }
        view.onDeleteItems = { links.trash($0.map(\.id)) }
        view.onPin = { links.select(id, width: line.viewportWidth); line.focusShelf(.links); links.togglePin(id) }
        view.onClick = { flags in
            links.select(id, toggle: flags.contains(.command), extending: flags.contains(.shift), width: line.viewportWidth)
            if !links.selecting && flags.intersection([.command, .shift]).isEmpty { links.copyAction(id) }
            line.focusShelf(.links)
        }
        view.onDoubleClick = { line.onLinkPreviewRequested?(id) }; view.onLongPress = { line.onLinkPreviewRequested?(id) }
        view.onDiscard = { links.removeFromShelf(id) }
        view.onPressChange = { line.pressedID = $0 ? id : nil; if $0 { line.focusShelf(.links, requestFocus: false) } }
        view.onDragStart = { line.draggingID = id }; view.onDragEnd = { line.draggingID = nil }
        view.menuProvider = {
            let menu = NSMenu()
            menu.addItem(ClosureMenuItem(L("Copy")) { links.copyAction(id) })
            menu.addItem(ClosureMenuItem(L("Preview")) { line.onLinkPreviewRequested?(id) })
            menu.addItem(ClosureMenuItem(entry.favorite ? L("Unpin") : L("Pin favorite")) { links.togglePin(id) })
            menu.addItem(ClosureMenuItem(L("Name and pin…")) { line.onNameAndPinRequested?(id) })
            menu.addItem(ClosureMenuItem(L("Open in browser")) { if let url = entry.linkURL { NSWorkspace.shared.open(url) } })
            menu.addItem(ClosureMenuItem(L("Move to Trash…")) { links.select(id, width: line.viewportWidth); line.focusShelf(.links); line.onTrashRequested?() })
            menu.addItem(ClosureMenuItem(L("Library…")) { line.onLibraryRequested?() })
            return menu
        }
    }
}
