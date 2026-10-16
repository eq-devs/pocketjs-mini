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
        if ["camera-deny", "camera-cancel"].contains(pjmMediaUiCase) && !cold {
            let camera = XCUIApplication(bundleIdentifier: "com.apple.springboard").alerts.firstMatch
            XCTAssertTrue(camera.waitForExistence(timeout: 20))
            XCTAssertTrue(camera.staticTexts.matching(NSPredicate(format: "label CONTAINS[c] %@", "Camera")).firstMatch.exists)
            let shot = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
            shot.name = "camera-system-permission"; shot.lifetime = .keepAlways; add(shot)
            if pjmMediaUiCase == "camera-deny" {
                camera.buttons.matching(NSPredicate(format: "label BEGINSWITH[c] %@", "Don")).firstMatch.tap()
            } else {
                camera.buttons["Allow"].tap()
            }
        }
        if pjmMediaUiCase == "camera-cancel" {
            let cancel = app.buttons.matching(NSPredicate(format: "identifier == %@ OR label == %@", "DismissImagePickerButton", "Cancel")).firstMatch
            XCTAssertTrue(cancel.waitForExistence(timeout: 20), "Camera cancellation control missing")
            XCTAssertTrue(app.buttons["PhotoCapture"].exists)
            keep(cold ? "camera-cold-picker" : "camera-picker", app)
            cancel.tap()
        }
        if ["library", "camera-deny", "camera-cancel"].contains(pjmMediaUiCase) {
            // The disposable library's newest asset is the owned 64×32 fixture.
            // SDK metadata checks reject accidentally selecting a stock image.
            let photo = app.images.matching(identifier: "PXGGridLayout-Info").firstMatch
            XCTAssertTrue(photo.waitForExistence(timeout: 20))
            let hierarchy = XCTAttachment(string: app.debugDescription)
            hierarchy.name = "media-library-hierarchy"; hierarchy.lifetime = .keepAlways; add(hierarchy)
            keep(cold ? "media-cold-library" : "media-library", app)
            photo.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
            let add = app.buttons["Add"].firstMatch
            if add.waitForExistence(timeout: 3) { add.tap() }
        }
        let code = pjmMediaUiCase == "camera-cancel" ? "CAMERA_CANCELLED_RECOVERED" : pjmMediaUiCase == "camera-deny" ? "CAMERA_DENIED_RECOVERED" : pjmMediaUiCase == "deny" ? "DENIED" : ["provider", "library"].contains(pjmMediaUiCase) ? "SUCCESS" : pjmMediaUiCase == "overflow" ? "OVERFLOW_RECOVERED" : pjmMediaUiCase == "quota" ? "QUOTA_RECOVERED" : pjmMediaUiCase == "retire" ? "RETIRED" : pjmMediaUiCase == "late" ? "RECOVERED" : "CANCELLED"
        XCTAssertEqual(XCTWaiter.wait(for: [XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in
            surface.exists && (surface.value as? String)?.contains(" media=" + code) == true
        }, object: nil)], timeout: 30), .completed, "Expected media \(code); observed \(String(describing: surface.value))")
        let receipt = XCTAttachment(string: surface.value as? String ?? "")
        receipt.name = cold ? "media-cold-sdk-receipt" : "media-sdk-receipt"
        receipt.lifetime = .keepAlways; add(receipt)
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
        if pjmAppExit {
            tap(3, surface)
            let closed = app.staticTexts["pjm-app-closed"]
            XCTAssertTrue(closed.waitForExistence(timeout: 20))
            XCTAssertEqual(closed.value as? String, "unload=saved ownership=passed")
            XCTAssertEqual(app.state, .runningForeground)
            keep("guest-exit-closed", app)
        }
    }
}
