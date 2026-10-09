import XCTest
import UIKit
final class BenchmarkMetalTests: XCTestCase {
    func point(_ surface: XCUIElement, _ x: CGFloat, _ y: CGFloat) -> XCUICoordinate {
        let scale = min(surface.frame.width / 390, surface.frame.height / 844)
        let left = (surface.frame.width - 390 * scale) / 2
        let top = (surface.frame.height - 844 * scale) / 2
        return surface.coordinate(withNormalizedOffset: .zero).withOffset(CGVector(dx: left + x * scale, dy: top + y * scale))
    }
    func capture(_ name: String, _ surface: XCUIElement) -> Data {
        let screenshot = XCUIScreen.main.screenshot()
        let attachment = XCTAttachment(screenshot: screenshot)
        attachment.name = name; attachment.lifetime = .keepAlways; add(attachment)
        let image = screenshot.image.cgImage!
        let scale = CGFloat(image.width) / XCUIApplication().frame.width
        let frame = surface.frame
        return UIImage(cgImage: image.cropping(to: CGRect(x: frame.minX * scale, y: frame.minY * scale, width: frame.width * scale, height: frame.height * scale))!).pngData()!
    }
    func testActualListScrollAndForm() {
        continueAfterFailure = false
        XCUIDevice.shared.orientation = .portrait
        let app = XCUIApplication();app.launch()
        let surface = app.otherElements["pjm-signed-surface"]
        XCTAssertTrue(surface.waitForExistence(timeout: 15))
        Thread.sleep(forTimeInterval: 0.5)
        XCTAssertFalse(app.staticTexts["pjm-status"].exists)
        let initial = capture("benchmark-initial", surface)
        for _ in 0..<6 {point(surface, 195, 650).press(forDuration: 0.05, thenDragTo: point(surface, 195, 200), withVelocity: .slow, thenHoldForDuration: 0)}
        let scrolled = capture("benchmark-scrolled", surface)
        XCTAssertNotEqual(initial, scrolled)
        point(surface, 340, 32).tap()
        let form = capture("benchmark-form", surface)
        XCTAssertNotEqual(scrolled, form)
        XCTAssertFalse(app.staticTexts["pjm-status"].exists)
        app.terminate()
    }
}
