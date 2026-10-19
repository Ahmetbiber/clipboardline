import Foundation
#if !STANDALONE_TESTS
import XCTest
@testable import Tendedero
#endif

final class PublicUpdateChannelTests: HistoryTestCase {
    private var info: [String: Any] {
        ["CFBundleIdentifier": "local.clipboardline.review",
         "ClipboardLinePublicUpdateRepository": "orkunisitmak/clipboardline-desktop",
         "SUFeedURL": "https://github.com/orkunisitmak/clipboardline-desktop/releases/latest/download/appcast.xml",
         "SUPublicEDKey": "s9DO901wav4VK/hfnLROxJYk4+oNFYvxdOK974E3PgI=",
         "SURequireSignedFeed": true, "SUVerifyUpdateBeforeExtraction": true,
         "SUSignedFeedFailureExpirationInterval": 0,
         "SUAllowsAutomaticUpdates": false, "SUAutomaticallyUpdate": false,
         "SUEnableSystemProfiling": false]
    }

    func testOnlyBundledAnonymousChannelIsAccepted() {
        XCTAssertEqual(PublicUpdateChannel(info: info)?.feedURL.absoluteString, PublicUpdateChannel.feed)
        for (key, invalid) in [
            ("CFBundleIdentifier", "another.app"),
            ("ClipboardLinePublicUpdateRepository", "orkunisitmak/clipboardline"),
            ("SUFeedURL", "https://github.com/orkunisitmak/clipboardline/releases/latest/download/appcast.xml"),
            ("SUFeedURL", "http://127.0.0.1/appcast.xml"),
            ("SUFeedURL", PublicUpdateChannel.feed + "?token=private"),
            ("SUPublicEDKey", Data(repeating: 1, count: 32).base64EncodedString())
        ] {
            var candidate = info
            candidate[key] = invalid
            XCTAssertNil(PublicUpdateChannel(info: candidate), key)
        }
    }

    func testLegacySignedBundleKeepsItsExactFeedWithoutAcceptingMixedChannels() {
        var legacy = info
        legacy["ClipboardLinePublicUpdateRepository"] = PublicUpdateChannel.legacyRepository
        legacy["SUFeedURL"] = PublicUpdateChannel.legacyFeed
        XCTAssertEqual(PublicUpdateChannel(info: legacy)?.feedURL.absoluteString, PublicUpdateChannel.legacyFeed)
        legacy["ClipboardLinePublicUpdateRepository"] = PublicUpdateChannel.repository
        XCTAssertNil(PublicUpdateChannel(info: legacy))
        legacy["SUFeedURL"] = PublicUpdateChannel.feed
        legacy["ClipboardLinePublicUpdateRepository"] = PublicUpdateChannel.legacyRepository
        XCTAssertNil(PublicUpdateChannel(info: legacy))
    }

    func testMissingOrRelaxedVerificationAndAutomaticInstallationAreRejected() {
        for key in ["SURequireSignedFeed", "SUVerifyUpdateBeforeExtraction", "SUSignedFeedFailureExpirationInterval",
                    "SUAllowsAutomaticUpdates", "SUAutomaticallyUpdate", "SUEnableSystemProfiling"] {
            var candidate = info
            candidate.removeValue(forKey: key)
            XCTAssertNil(PublicUpdateChannel(info: candidate), "missing \(key)")
        }
        for key in ["SURequireSignedFeed", "SUVerifyUpdateBeforeExtraction"] {
            var candidate = info
            candidate[key] = false
            XCTAssertNil(PublicUpdateChannel(info: candidate), key)
        }
        for key in ["SUAllowsAutomaticUpdates", "SUAutomaticallyUpdate", "SUEnableSystemProfiling"] {
            var candidate = info
            candidate[key] = true
            XCTAssertNil(PublicUpdateChannel(info: candidate), key)
        }
        var candidate = info
        candidate["SUSignedFeedFailureExpirationInterval"] = 60
        XCTAssertNil(PublicUpdateChannel(info: candidate))
    }

    func testOldAutomaticCheckOptOutWinsWithoutChangingSavedPreferences() {
        let suite = "synthetic-public-updates-\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }
        XCTAssertTrue(PublicUpdateChannel.automaticChecksEnabled(in: defaults))
        defaults.set(false, forKey: "SUEnableAutomaticChecks")
        XCTAssertFalse(PublicUpdateChannel.automaticChecksEnabled(in: defaults))
        defaults.set(true, forKey: AutomaticUpdateSchedule.preferenceKey)
        XCTAssertTrue(PublicUpdateChannel.automaticChecksEnabled(in: defaults))
        defaults.set(false, forKey: AutomaticUpdateSchedule.preferenceKey)
        defaults.set(true, forKey: "SUEnableAutomaticChecks")
        let before = defaults.persistentDomain(forName: suite)! as NSDictionary
        XCTAssertFalse(PublicUpdateChannel.automaticChecksEnabled(in: defaults))
        XCTAssertEqual(defaults.persistentDomain(forName: suite)! as NSDictionary, before)
    }

#if canImport(Sparkle)
    @MainActor
    func testDriverInitializationAndEditVetoDoNotStartAnUpdateOrInvokeInstallation() {
        let suite = "synthetic-public-update-driver-\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }
        XCTAssertNil(SparkleUpdateDriver(enabled: false, defaults: defaults, info: info))
        XCTAssertNil(SparkleUpdateDriver(defaults: defaults, info: [:]))
        let driver = SparkleUpdateDriver(defaults: defaults, info: info)!
        for selector in ["updater:mayPerformUpdateCheck:error:", "updater:didFindValidUpdate:",
                         "updaterDidNotFindUpdate:", "updater:userDidMakeChoice:forUpdate:state:",
                         "updater:shouldPostponeRelaunchForUpdate:untilInvokingBlock:"] {
            XCTAssertTrue(driver.responds(to: NSSelectorFromString(selector)), "Sparkle delegate \(selector)")
        }
        var installCalls = 0
        driver.canQuit = { false }
        XCTAssertTrue(driver.postponeRelaunchIfNeeded { installCalls += 1 })
        XCTAssertEqual(installCalls, 0)
        XCTAssertNotNil(driver.error)
        XCTAssertFalse(driver.busy)
        driver.canQuit = { true }
        XCTAssertFalse(driver.postponeRelaunchIfNeeded { installCalls += 1 })
        XCTAssertEqual(installCalls, 0, "Sparkle, not the veto check, owns invoking its installation handler")
        XCTAssertNil(defaults.object(forKey: AutomaticUpdateSchedule.lastAttemptKey))
        driver.stop()
    }
#endif
}
