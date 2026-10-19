import Foundation

/// The official anonymous channel is selected by the signed application, never
/// by a remote feed, preferences or a saved private GitHub connection.
struct PublicUpdateChannel: Equatable {
    static let repository = "orkunisitmak/clipboardline-app"
    static let feed = "https://github.com/orkunisitmak/clipboardline-app/releases/latest/download/appcast.xml"
    static let publicKey = "s9DO901wav4VK/hfnLROxJYk4+oNFYvxdOK974E3PgI="

    let feedURL: URL

    init?(info: [String: Any]) {
        guard info["CFBundleIdentifier"] as? String == "local.clipboardline.review",
              info["ClipboardLinePublicUpdateRepository"] as? String == Self.repository,
              info["SUFeedURL"] as? String == Self.feed,
              info["SUPublicEDKey"] as? String == Self.publicKey,
              info["SURequireSignedFeed"] as? Bool == true,
              info["SUVerifyUpdateBeforeExtraction"] as? Bool == true,
              (info["SUSignedFeedFailureExpirationInterval"] as? NSNumber)?.doubleValue == 0,
              info["SUAllowsAutomaticUpdates"] as? Bool == false,
              info["SUAutomaticallyUpdate"] as? Bool == false,
              info["SUEnableSystemProfiling"] as? Bool == false,
              let url = URL(string: Self.feed) else { return nil }
        feedURL = url
    }

    /// Preserve the existing update opt-out when moving from the private client.
    /// No credential is read, authorized, migrated or deleted by this operation.
    static func automaticChecksEnabled(in defaults: UserDefaults) -> Bool {
        if let previous = defaults.object(forKey: AutomaticUpdateSchedule.preferenceKey) as? Bool { return previous }
        return defaults.object(forKey: "SUEnableAutomaticChecks") as? Bool ?? true
    }
}
