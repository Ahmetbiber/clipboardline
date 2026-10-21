import AppKit
#if !STANDALONE_TESTS
import XCTest
@testable import Tendedero
#endif

@MainActor final class ShelfPresentationTests: HistoryTestCase {
    private func wait(_ predicate: () -> Bool) {
        let deadline = Date().addingTimeInterval(3)
        while !predicate(), Date() < deadline { RunLoop.current.run(until: Date().addingTimeInterval(0.005)) }
        XCTAssertTrue(predicate(), "Native shelf presentation did not settle")
    }

    func testNativeVisibilityKeepsWindowContentAndHitCoordinatesFixed() throws {
        _ = NSApplication.shared
        let content = NSView(frame: NSRect(x: 0, y: 0, width: 900, height: 780))
        let child = NSView(frame: NSRect(x: 30, y: 50, width: 100, height: 80))
        content.addSubview(child)
        let panel = LinePanel(content: content)
        defer { panel.contentView = nil }
        panel.setFrame(NSRect(x: -900, y: 250, width: 900, height: 780), display: false)
        let originalFrame = panel.frame, originalBounds = content.bounds
        let point = child.convert(NSPoint(x: 40, y: 40), to: content)
        let originalHit = content.hitTest(point)
        for on in [false, true, false, true] {
            panel.setShelfRevealed(on, animated: false)
            XCTAssertEqual(panel.frame, originalFrame, "Visibility must not move into a display above the shelf")
            XCTAssertEqual(content.bounds, originalBounds)
            XCTAssertTrue(panel.contentView === content)
            XCTAssertTrue(content.hitTest(point) === originalHit)
            XCTAssertEqual(panel.alphaValue, on ? 1 : 0)
        }
    }

    func testRapidVisibilityReversalCannotRunAnEarlierCloseCompletion() throws {
        _ = NSApplication.shared
        for reduceMotion in [false, true] {
            let panel = LinePanel(content: NSView(), reduceMotion: { reduceMotion })
            defer { panel.contentView = nil }
            var closed = 0, opened = 0
            // Both requests happen in one event turn, as with a queued global
            // shortcut. An earlier asynchronous completion must not hide the row.
            panel.setShelfRevealed(false) { closed += 1 }
            panel.setShelfRevealed(true) { opened += 1 }
            wait { opened == 1 }
            XCTAssertEqual(closed, 0)
            XCTAssertEqual(panel.alphaValue, 1)
            panel.setShelfRevealed(false) { closed += 1 }
            wait { closed == 1 }
            XCTAssertEqual(panel.alphaValue, 0)
        }
    }

    func testReducedMotionIsImmediateAndPresentationDoesNotClaimKeyboardOwnership() throws {
        _ = NSApplication.shared
        let panel = LinePanel(content: NSView(), reduceMotion: { true })
        defer { panel.contentView = nil }
        var captures = 0
        panel.onBeforeMouseKeyFocus = { captures += 1 }
        panel.keyboardFocusAllowed = false
        panel.setShelfRevealed(false)
        XCTAssertEqual(panel.alphaValue, 0)
        panel.setShelfRevealed(true)
        XCTAssertEqual(panel.alphaValue, 1)
        XCTAssertFalse(panel.isVisible)
        XCTAssertFalse(panel.isKeyWindow)
        XCTAssertFalse(panel.keyboardFocusAllowed)
        XCTAssertEqual(captures, 0, "Exact paste-target capture stays at the caller's focus boundary")
        panel.keyboardFocusAllowed = true
        panel.setShelfRevealed(false)
        XCTAssertTrue(panel.keyboardFocusAllowed, "The AppDelegate still owns focus release and return")
    }
}
