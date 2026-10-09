import XCTest

final class MiniTests: XCTestCase {
    func waitProof(_ surface: XCUIElement, _ path: String, _ count: Int) {
        let value = "navigation path=" + path + " count=" + String(count) + " item=" + (path == "/detail" ? "42" : "null")
        XCTAssertEqual(XCTWaiter.wait(for: [XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in
            guard surface.exists, let observed = surface.value as? String, observed.hasPrefix(value + " network=") else { return false }
            return ["none", "wifi", "cellular", "ethernet", "other"].contains { observed.contains(" network=" + $0 + " events=") }
        }, object: nil)], timeout: 30), .completed)
    }
    func tap(_ index: Int, _ surface: XCUIElement) {
        let frame = surface.frame
        let width = CGFloat(pjmNavigationWidth), height = CGFloat(pjmNavigationHeight)
        let scale = min(frame.width / width, frame.height / height)
        let point = pjmNavigationPoints[index]
        let x = ((frame.width - width * scale) / 2 + CGFloat(point[0]) * scale) / frame.width
        let y = ((frame.height - height * scale) / 2 + CGFloat(point[1]) * scale) / frame.height
        surface.coordinate(withNormalizedOffset: CGVector(dx: x, dy: y)).tap()
    }
    func keep(_ name: String, _ app: XCUIApplication) {
        let shot = XCTAttachment(screenshot: app.screenshot()); shot.name = name; shot.lifetime = .keepAlways; add(shot)
    }
    func media(_ app: XCUIApplication, _ surface: XCUIElement, cold: Bool = false) {
        guard !pjmMediaUiCase.isEmpty else { return }
        if !cold {
            let consent = app.alerts["Image access"]
            XCTAssertTrue(consent.waitForExistence(timeout: 20))
            keep("media-consent", app)
            consent.buttons[pjmMediaUiCase == "deny" ? "Don’t allow" : "Allow"].tap()
        }
        if pjmMediaUiCase == "cancel" {
            let cancel = app.buttons["Cancel"].firstMatch
            XCTAssertTrue(cancel.waitForExistence(timeout: 20))
            keep(cold ? "media-cold-picker" : "media-picker", app)
            cancel.tap()
        }
        let code = pjmMediaUiCase == "deny" ? "DENIED" : pjmMediaUiCase == "provider" ? "SUCCESS" : pjmMediaUiCase == "overflow" ? "FAILED" : pjmMediaUiCase == "late" ? "RECOVERED" : "CANCELLED"
        XCTAssertEqual(XCTWaiter.wait(for: [XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in
            surface.exists && (surface.value as? String)?.contains(" media=" + code) == true
        }, object: nil)], timeout: 30), .completed)
        keep(cold ? "media-cold-result" : "media-result", app)
    }
    func testSignedTsxNavigationIgnoresDevelopmentURL() {
        continueAfterFailure = false
        XCUIDevice.shared.orientation = .portrait
        let app = XCUIApplication()
        app.launchArguments = ["--pjm-url", "http://127.0.0.1:1/untrusted/"]
        app.launch()
        let surface = app.otherElements["pjm-signed-surface"]
        media(app, surface)
        XCTAssertTrue(surface.waitForExistence(timeout: 20))
        waitProof(surface, "/", 0); keep("signed-home", app)
        tap(0, surface); waitProof(surface, "/", 1)
        tap(1, surface); waitProof(surface, "/detail", 1); keep("signed-detail", app)
        tap(2, surface); waitProof(surface, "/", 1); keep("signed-button-home", app)
        tap(1, surface); waitProof(surface, "/detail", 1)
        XCUIDevice.shared.press(.home); app.activate()
        waitProof(surface, "/detail", 1); keep("signed-resumed-detail", app)
        tap(2, surface); waitProof(surface, "/", 1)
        app.terminate(); app.launch()
        media(app, surface, cold: true)
        XCTAssertTrue(surface.waitForExistence(timeout: 20))
        waitProof(surface, "/", 0); keep("signed-cold-home", app)
        XCTAssertFalse(app.staticTexts["pjm-status"].exists)
    }
}
