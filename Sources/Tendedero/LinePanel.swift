import AppKit
import QuartzCore

struct ShelfSearchFocus: Equatable {
    let shelf: Shelf
    let request: Int
}

/// A transparent strip along the top of the screen that floats over every
/// app and every Space except full screen ones, takes keyboard focus for browsing, and lets clicks pass through
/// everywhere except over the photos.
final class LinePanel: NSPanel {
    private let reduceMotion: () -> Bool
    private var visibilityGeneration = 0
    var keyboardFocusAllowed = false
    var onKey: ((NSEvent) -> Bool)?
    var onCommandKey: ((NSEvent) -> Bool)?
    var onBeforeMouseKeyFocus: (() -> Void)?
    var onScroll: ((CGFloat, CGFloat, Bool) -> Void)?
    var onScrollLocation: ((NSPoint) -> Void)?
    var contentHeight = Layout.panelHeight
    var searchEditorTarget: (() -> ShelfSearchFocus?)?
    private var pendingSearchTarget: ShelfSearchFocus?
    private var pendingSearchKeys = [NSEvent]()

    /// SwiftUI may need one layout turn to mount a newly opened field. Keep
    /// input from that interval in order, and never send it to a later search.
    func deliverPendingSearchKeys(for target: ShelfSearchFocus, to editor: NSTextView) {
        let events = pendingSearchTarget == target ? pendingSearchKeys : []
        pendingSearchKeys.removeAll(); pendingSearchTarget = nil
        for event in events {
            guard searchEditorTarget?() == target, firstResponder === editor else { break }
            editor.interpretKeyEvents([event])
        }
    }

    func routeKey(_ event: NSEvent, isFocused: Bool) -> Bool {
        guard event.type == .keyDown, keyboardFocusAllowed, isFocused else { return false }
        if !event.modifierFlags.intersection([.command, .control]).isEmpty,
           onCommandKey?(event) == true { return true }
        // Search owns the native field editor. Ordinary typing, arrows,
        // Backspace and editing shortcuts must never trigger shelf actions.
        if firstResponder is NSTextView || firstResponder is NSTextField { return false }
        if let target = searchEditorTarget?() {
            if pendingSearchTarget != target { pendingSearchKeys.removeAll(); pendingSearchTarget = target }
            pendingSearchKeys.append(event)
            return true
        }
        pendingSearchKeys.removeAll(); pendingSearchTarget = nil
        return onKey?(event) == true
    }

    override func sendEvent(_ event: NSEvent) {
        prepareForMouseKeyFocus(event, isFocused: isKeyWindow)
        if event.type == .leftMouseDown { prepareSearchMouseFocus(at: event.locationInWindow) }
        if routeKey(event, isFocused: isKeyWindow) { return }
        if event.type == .scrollWheel, let onScroll {
            onScrollLocation?(event.locationInWindow)
            onScroll(event.scrollingDeltaX, event.scrollingDeltaY, event.hasPreciseScrollingDeltas)
            return
        }
        super.sendEvent(event)
    }

    /// A still-visible nonactivating shelf can be clicked after the user has
    /// moved to a different external field. Capture before AppKit or a child
    /// view claims key focus; the later Library/copy action is already too late.
    func prepareForMouseKeyFocus(_ event: NSEvent, isFocused: Bool) {
        guard event.type == .leftMouseDown, !isFocused else { return }
        onBeforeMouseKeyFocus?()
    }

    /// New AppKit search fields have interactive child views. Mark the owning
    /// shelf before those children start editing, rather than waiting for the
    /// first text-change notification and losing focus during a SwiftUI update.
    func prepareSearchMouseFocus(at windowPoint: NSPoint) {
        guard let content = contentView else { return }
        let point = content.superview?.convert(windowPoint, from: nil) ?? windowPoint
        var candidate = content.hitTest(point)
        while let view = candidate {
            if let field = view as? ShelfSearchTextField { field.prepareForMouseEditing(); return }
            candidate = view.superview
        }
    }

    init(content: NSView, reduceMotion: @escaping () -> Bool = { NSWorkspace.shared.accessibilityDisplayShouldReduceMotion }) {
        self.reduceMotion = reduceMotion
        super.init(contentRect: .zero, styleMask: [.borderless, .nonactivatingPanel],
                   backing: .buffered, defer: false)
        isOpaque = false
        backgroundColor = .clear
        hasShadow = false
        level = .floating
        // Every Space, full screen ones included. Whether the line comes down
        // over a full screen app is up to the user, see FullScreen.showLineOver.
        collectionBehavior = [.canJoinAllSpaces, .stationary, .ignoresCycle, .fullScreenAuxiliary]
        hidesOnDeactivate = false
        isMovable = false
        becomesKeyOnlyIfNeeded = true
        ignoresMouseEvents = true
        contentView = content
    }

    override var canBecomeKey: Bool { keyboardFocusAllowed }
    override var canBecomeMain: Bool { false }

    /// Fade the already laid out native window instead of moving every
    /// SwiftUI card. Window opacity is composited without new row layout or
    /// geometry preferences on every animation frame. The fixed frame also
    /// keeps hit coordinates and the owning display stable on stacked screens.
    /// A rapid reversal invalidates an older close completion before it can
    /// order out the newly opened window.
    func setShelfRevealed(_ on: Bool, animated: Bool = true, completion: (() -> Void)? = nil) {
        visibilityGeneration += 1
        let generation = visibilityGeneration
        let target: CGFloat = on ? 1 : 0
        let duration: TimeInterval = animated && !reduceMotion() ? (on ? 0.12 : 0.10) : 0
        if duration == 0 {
            alphaValue = target
            DispatchQueue.main.async { [weak self] in
                guard let self, self.visibilityGeneration == generation else { return }
                completion?()
            }
            return
        }
        NSAnimationContext.runAnimationGroup { context in
            context.duration = duration
            context.timingFunction = CAMediaTimingFunction(name: .easeOut)
            animator().alphaValue = target
        } completionHandler: { [weak self] in
            guard let self, self.visibilityGeneration == generation else { return }
            completion?()
        }
    }

    /// The line hangs on the screen you are using, which is the one with the
    /// pointer: that is where you just took the screenshot.
    static func screenUnderPointer() -> NSScreen? {
        let mouse = NSEvent.mouseLocation
        return NSScreen.screens.first { NSMouseInRect(mouse, $0.frame, false) }
            ?? NSScreen.main ?? NSScreen.screens.first
    }

    func placeOnScreen(_ screen: NSScreen? = nil) {
        guard let visible = (screen ?? LinePanel.screenUnderPointer())?.visibleFrame else { return }
        let target = NSRect(x: visible.minX, y: visible.maxY - contentHeight,
                            width: visible.width, height: contentHeight)
        // Presentation follows placement/capacity in the same turn. Do not
        // force a synchronous SwiftUI draw before that final state is ready.
        if frame != target { setFrame(target, display: false) }
    }
}
