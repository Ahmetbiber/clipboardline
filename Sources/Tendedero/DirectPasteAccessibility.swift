import AppKit
import ApplicationServices

/// Resolve the keyboard input target without reading its value or selection.
/// AXValue being assignable is unrelated to an editor accepting Command-V.
@MainActor enum DirectPasteAccessibility {
    struct Environment {
        var focusedElement: (pid_t) -> AnyObject?
        var attribute: (AnyObject, String) -> AnyObject?
        var isElement: (AnyObject) -> Bool

        static var system: Environment {
            func attribute(_ object: AnyObject, _ name: String) -> AnyObject? {
                let element = unsafeBitCast(object, to: AXUIElement.self)
                AXUIElementSetMessagingTimeout(element, 0.15)
                var value: CFTypeRef?
                guard AXUIElementCopyAttributeValue(element, name as CFString, &value) == .success else { return nil }
                return value
            }
            return Environment(focusedElement: { pid in
                let application = AXUIElementCreateApplication(pid)
                return attribute(application, kAXFocusedUIElementAttribute)
            }, attribute: attribute, isElement: { CFGetTypeID($0) == AXUIElementGetTypeID() })
        }
    }

    private struct Capabilities {
        let textRole: Bool
        let editable: Bool?
        let enabled: Bool
        let secure: Bool
        var blocked: Bool { !enabled || editable == false || secure }
    }

    static func focusedField(_ pid: pid_t) -> DirectPasteCoordinator.FocusedField? {
        focusedField(pid, environment: .system)
    }

    static func focusedField(_ pid: pid_t, environment: Environment) -> DirectPasteCoordinator.FocusedField? {
        guard let leaf = environment.focusedElement(pid), environment.isElement(leaf) else { return nil }
        func capabilities(_ element: AnyObject) -> Capabilities {
            let role = environment.attribute(element, kAXRoleAttribute) as? String
            let subrole = environment.attribute(element, kAXSubroleAttribute) as? String
            let editable = environment.attribute(element, "AXEditable") as? Bool
            let isEditable = environment.attribute(element, kAXIsEditableAttribute) as? Bool
            // An explicit read-only answer wins over a conflicting positive hint.
            let hint: Bool? = editable == false || isEditable == false ? false : editable ?? isEditable
            DirectPasteDiagnostics.log.debug("Field role=\(role ?? "missing", privacy: .public) subrole=\(subrole ?? "missing", privacy: .public) editable=\(String(describing: hint), privacy: .public)")
            return Capabilities(textRole: role == kAXTextFieldRole || role == kAXTextAreaRole || role == kAXComboBoxRole,
                editable: hint, enabled: (environment.attribute(element, kAXEnabledAttribute) as? Bool) != false,
                secure: role == kAXSecureTextFieldSubrole || subrole == kAXSecureTextFieldSubrole)
        }
        func field(_ element: AnyObject, _ facts: Capabilities, ancestor: Bool = false) -> DirectPasteCoordinator.FocusedField {
            .init(identity: element, editable: !facts.blocked && (ancestor || facts.textRole || facts.editable == true), secure: facts.secure)
        }

        let leafFacts = capabilities(leaf)
        // A secure, disabled or explicitly read-only descendant cannot be made
        // eligible by walking up to an ordinary contenteditable container.
        guard !leafFacts.blocked else { return field(leaf, leafFacts) }
        var ancestors = [(AnyObject, Capabilities)]()
        for name in [kAXHighestEditableAncestorAttribute, kAXEditableAncestorAttribute] {
            guard let ancestor = environment.attribute(leaf, name), environment.isElement(ancestor) else { continue }
            let facts = capabilities(ancestor)
            guard !facts.blocked else { return field(ancestor, facts) }
            ancestors.append((ancestor, facts))
        }
        // The editable-ancestor relation is positive evidence for custom rich
        // editor roles. Prefer the highest root so focused DOM descendants
        // resolve to the same identity when the browser restores focus.
        if let (ancestor, facts) = ancestors.first { return field(ancestor, facts, ancestor: true) }
        // The application vends this element. Its AX owner may be a remote
        // WebContent process; activation and keyboard events still target pid.
        return field(leaf, leafFacts)
    }
}
