import XCTest
import UIKit
final class InstalledEntryTests: XCTestCase {
    func pixel(_ app: XCUIApplication, _ point: CGPoint) -> [UInt8] {
        guard let image = XCUIScreen.main.screenshot().image.cgImage else { return [] }
        let scale = CGFloat(image.width) / app.frame.width
        guard let sample = image.cropping(to: CGRect(x: point.x * scale, y: point.y * scale, width: 1, height: 1)) else { return [] }
        var bytes = [UInt8](repeating: 0, count: 4)
        bytes.withUnsafeMutableBytes { storage in
            let context = CGContext(data: storage.baseAddress, width: 1, height: 1, bitsPerComponent: 8, bytesPerRow: 4, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue | CGBitmapInfo.byteOrder32Big.rawValue)!
            context.draw(sample, in: CGRect(x: 0, y: 0, width: 1, height: 1))
        }
        return Array(bytes.prefix(3))
    }
    func waitColor(_ app: XCUIApplication, _ surface: XCUIElement, _ rgb: [UInt8], file: StaticString = #filePath, line: UInt = #line) {
        let ready = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in
            guard surface.exists else { return false }
            return self.pixel(app, CGPoint(x: surface.frame.midX, y: surface.frame.midY)) == rgb
        }, object: nil)
        XCTAssertEqual(XCTWaiter.wait(for: [ready], timeout: 15), .completed, file: file, line: line)
    }
    func testSignedHostIgnoresDevelopmentURL() {
        continueAfterFailure = false
        XCUIDevice.shared.orientation = .portrait
        let app = XCUIApplication()
        app.launchArguments = ["--pjm-url", "http://127.0.0.1:1/untrusted/"]
        app.launch()
        let surface = app.otherElements["pjm-signed-surface"]
        XCTAssertTrue(surface.waitForExistence(timeout: 15))
        XCTAssertGreaterThan(surface.frame.width, 0)
        XCTAssertGreaterThan(surface.frame.height, 0)
        XCTAssertFalse(app.staticTexts["pjm-status"].exists)
        waitColor(app, surface, [255, 0, 0])
        let letterbox = CGPoint(x: surface.frame.midX, y: surface.frame.minY + surface.frame.height * 0.1)
        XCTAssertEqual(pixel(app, letterbox), [0, 0, 0])
        surface.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.1)).tap()
        for _ in 0..<3 { Thread.sleep(forTimeInterval: 0.1); XCTAssertEqual(pixel(app, CGPoint(x: surface.frame.midX, y: surface.frame.midY)), [255, 0, 0]) }
        surface.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
        waitColor(app, surface, [0, 0, 255])
        XCUIDevice.shared.press(.home)
        app.activate()
        waitColor(app, surface, [0, 0, 255])
        app.terminate()
        app.launch()
        XCTAssertTrue(surface.waitForExistence(timeout: 15))
        XCTAssertFalse(app.staticTexts["pjm-status"].exists)
        waitColor(app, surface, [255, 0, 0])
    }
}
