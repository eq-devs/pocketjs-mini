import XCTest
final class InstalledEntryTests: XCTestCase {
    func testSignedHostIgnoresDevelopmentURL() {
        let app = XCUIApplication()
        app.launchArguments = ["--pjm-url", "http://127.0.0.1:1/untrusted/"]
        app.launch()
        let surface = app.otherElements["pjm-signed-surface"]
        XCTAssertTrue(surface.waitForExistence(timeout: 15))
        XCTAssertGreaterThan(surface.frame.width, 0)
        XCTAssertGreaterThan(surface.frame.height, 0)
        XCTAssertFalse(app.staticTexts["pjm-status"].exists)
        app.terminate()
        app.launch()
        XCTAssertTrue(surface.waitForExistence(timeout: 15))
        XCTAssertFalse(app.staticTexts["pjm-status"].exists)
    }
}
