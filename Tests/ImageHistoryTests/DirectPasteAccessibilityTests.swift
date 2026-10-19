import AppKit
import ApplicationServices
#if !STANDALONE_TESTS
import XCTest
@testable import Tendedero
#endif

@MainActor private final class PasteAccessibilityFixture {
    final class Element: NSObject {
        var attributes: [String: AnyObject] = [:]
        let ownerPID: pid_t
        init(role: String, ownerPID: pid_t = 101) {
            self.ownerPID = ownerPID
            attributes[kAXRoleAttribute] = role as NSString
        }
        func set(_ name: String, _ value: Bool) { attributes[name] = NSNumber(value: value) }
    }
    var focused: AnyObject?
    var requestedPIDs = [pid_t]()
    var reads = [String]()
    var environment: DirectPasteAccessibility.Environment {
        .init(focusedElement: { self.requestedPIDs.append($0); return self.focused }, attribute: { element, name in
            self.reads.append(name)
            return (element as? Element)?.attributes[name]
        }, isElement: { $0 is Element })
    }
    func resolve() -> DirectPasteCoordinator.FocusedField? { DirectPasteAccessibility.focusedField(101, environment: environment) }
}

@MainActor final class DirectPasteAccessibilityTests: HistoryTestCase {
    func testPasteAccessibilityTextRolesDoNotRequireSettableValueOrReadContent() throws {
        for role in [kAXTextFieldRole, kAXTextAreaRole, kAXComboBoxRole] {
            let fixture = PasteAccessibilityFixture(), element = PasteAccessibilityFixture.Element(role: role)
            // An app may expose a nonassignable AX value while accepting paste.
            // The resolver never even requests that value or its settable state.
            element.attributes[kAXValueAttribute] = "Must not be read" as NSString
            element.attributes[kAXSelectedTextAttribute] = "Must not be read" as NSString
            fixture.focused = element
            let field = try XCTUnwrap(fixture.resolve())
            XCTAssertTrue(field.identity === element); XCTAssertTrue(field.editable); XCTAssertFalse(field.secure)
            XCTAssertFalse(fixture.reads.contains(kAXValueAttribute)); XCTAssertFalse(fixture.reads.contains(kAXSelectedTextAttribute))
            XCTAssertFalse(fixture.reads.contains(kAXSelectedTextRangeAttribute))
        }
    }

    func testPasteAccessibilityResolvesContenteditableDescendantsToStableHighestRoot() throws {
        let fixture = PasteAccessibilityFixture()
        let leaf = PasteAccessibilityFixture.Element(role: kAXStaticTextRole)
        let editable = PasteAccessibilityFixture.Element(role: kAXTextAreaRole)
        let highest = PasteAccessibilityFixture.Element(role: kAXGroupRole)
        leaf.attributes[kAXEditableAncestorAttribute] = editable
        leaf.attributes[kAXHighestEditableAncestorAttribute] = highest
        fixture.focused = leaf
        let field = try XCTUnwrap(fixture.resolve())
        XCTAssertTrue(field.identity === highest); XCTAssertTrue(field.editable)
        let nextLeaf = PasteAccessibilityFixture.Element(role: kAXStaticTextRole)
        nextLeaf.attributes[kAXEditableAncestorAttribute] = highest
        fixture.focused = nextLeaf
        XCTAssertTrue(try XCTUnwrap(fixture.resolve()).identity === highest)
    }

    func testPasteAccessibilityExplicitEditableHintSupportsCustomEditorRoles() throws {
        for hint in ["AXEditable", kAXIsEditableAttribute] {
            let fixture = PasteAccessibilityFixture(), element = PasteAccessibilityFixture.Element(role: kAXGroupRole)
            element.set(hint, true); fixture.focused = element
            XCTAssertTrue(try XCTUnwrap(fixture.resolve()).editable)
        }
    }

    func testPasteAccessibilityDisabledSecureAndReadOnlyDescendantsCannotUseAncestor() throws {
        for blocked in ["disabled", "secure", "AXEditable", kAXIsEditableAttribute] {
            let fixture = PasteAccessibilityFixture(), leaf = PasteAccessibilityFixture.Element(role: kAXTextFieldRole)
            let ancestor = PasteAccessibilityFixture.Element(role: kAXTextAreaRole)
            leaf.attributes[kAXEditableAncestorAttribute] = ancestor
            switch blocked {
            case "disabled": leaf.set(kAXEnabledAttribute, false)
            case "secure": leaf.attributes[kAXSubroleAttribute] = kAXSecureTextFieldSubrole as NSString
            default: leaf.set(blocked, false)
            }
            fixture.focused = leaf
            let field = try XCTUnwrap(fixture.resolve())
            XCTAssertTrue(field.identity === leaf); XCTAssertFalse(field.editable)
            XCTAssertEqual(field.secure, blocked == "secure")
        }
    }

    func testPasteAccessibilityBlocksUnsafeAncestorsAndConflictingReadOnlyHints() throws {
        for blocked in ["disabled", "secure", "readOnly"] {
            let fixture = PasteAccessibilityFixture(), leaf = PasteAccessibilityFixture.Element(role: kAXStaticTextRole)
            let ancestor = PasteAccessibilityFixture.Element(role: kAXTextAreaRole)
            switch blocked {
            case "disabled": ancestor.set(kAXEnabledAttribute, false)
            case "secure": ancestor.attributes[kAXSubroleAttribute] = kAXSecureTextFieldSubrole as NSString
            default: ancestor.set("AXEditable", true); ancestor.set(kAXIsEditableAttribute, false)
            }
            leaf.attributes[kAXHighestEditableAncestorAttribute] = ancestor; fixture.focused = leaf
            XCTAssertFalse(try XCTUnwrap(fixture.resolve()).editable)
        }
    }

    func testPasteAccessibilityRejectsUnrelatedRolesAndMalformedFocusOrAncestors() throws {
        let fixture = PasteAccessibilityFixture()
        for role in [kAXButtonRole, kAXStaticTextRole, "AXWebArea", kAXGroupRole] {
            let element = PasteAccessibilityFixture.Element(role: role)
            element.attributes[kAXEditableAncestorAttribute] = "Not an element" as NSString
            fixture.focused = element
            XCTAssertFalse(try XCTUnwrap(fixture.resolve()).editable)
        }
        fixture.focused = nil; XCTAssertNil(fixture.resolve())
        fixture.focused = "Not an element" as NSString; XCTAssertNil(fixture.resolve())
    }

    func testPasteAccessibilityAcceptsAppVendedRemoteWebContentElement() throws {
        let fixture = PasteAccessibilityFixture()
        let remote = PasteAccessibilityFixture.Element(role: kAXTextAreaRole, ownerPID: 202)
        fixture.focused = remote
        let field = try XCTUnwrap(fixture.resolve())
        XCTAssertEqual(fixture.requestedPIDs, [101]); XCTAssertTrue(remote.ownerPID != 101)
        XCTAssertTrue(field.identity === remote); XCTAssertTrue(field.editable)
    }
}
