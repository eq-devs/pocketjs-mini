import XCTest
import UIKit

final class MiniTests: XCTestCase {
    func receipt(_ surface: XCUIElement, _ key: String) -> Int {
        let text = surface.value as? String ?? ""
        let token = text.split(separator: " ").first { $0.hasPrefix(key + "=") }
        return token.flatMap { Int($0.split(separator: "=")[1]) } ?? 0
    }
    func wait(_ condition: @escaping () -> Bool, timeout: TimeInterval = 90) {
        let result = XCTWaiter.wait(for: [XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in condition() }, object: nil)], timeout: timeout)
        XCTAssertEqual(result, .completed)
    }
    func assertPhoneCoverage(_ app: XCUIApplication) {
        let image = XCUIScreen.main.screenshot().image.cgImage!
        let width = image.width, height = image.height
        var pixels = [UInt8](repeating: 0, count: width * height * 4)
        let covered: Double = pixels.withUnsafeMutableBytes { bytes in
            let context = CGContext(data: bytes.baseAddress, width: width, height: height,
                bitsPerComponent: 8, bytesPerRow: width * 4, space: CGColorSpaceCreateDeviceRGB(),
                bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue | CGBitmapInfo.byteOrder32Big.rawValue)!
            context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
            let p = bytes.bindMemory(to: UInt8.self)
            var colored = 0
            for i in stride(from: 0, to: p.count, by: 4) {
                if p[i] != 0 || p[i + 1] != 0 || p[i + 2] != 0 { colored += 1 }
            }
            return Double(colored) / Double(width * height)
        }
        XCTAssertGreaterThan(covered, 0.85, "The dark fixture must fill the phone, not leave a clipped black half-screen")
    }
    func testNativeGuestInputReloadAndAutomaticPhoneLayout() throws {
        continueAfterFailure = false
        XCUIDevice.shared.orientation = .portrait
        let app = XCUIApplication(bundleIdentifier: "dev.pjm.host")
        app.launchArguments = ["--pjm-url", pjmTestURL]
        app.launch()
        let surface = app.otherElements["pocket-surface"]
        wait { surface.exists && self.receipt(surface, "frames") > 0 }
        let portraitWidth = receipt(surface, "width"), portraitHeight = receipt(surface, "height")
        XCTAssertGreaterThan(portraitHeight, portraitWidth)
        XCTAssertEqual(surface.frame.width, CGFloat(portraitWidth), accuracy: 1)
        XCTAssertEqual(surface.frame.height, CGFloat(portraitHeight), accuracy: 1)
        XCTAssertGreaterThan(portraitHeight, 500) // Cannot pass with the old 480x272 tile.
        assertPhoneCoverage(app)
        let initial = receipt(surface, "hash")
        surface.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
        wait { self.receipt(surface, "hash") != initial && self.receipt(surface, "touches") > 0 }
        let first = receipt(surface, "hash")
        surface.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
        wait { self.receipt(surface, "hash") != first && self.receipt(surface, "hash") != initial }
        let revision = receipt(surface, "revision")
        XCUIDevice.shared.orientation = .landscapeLeft
        wait { self.receipt(surface, "revision") > revision && self.receipt(surface, "width") > self.receipt(surface, "height") }
        XCTAssertEqual(surface.frame.width, CGFloat(receipt(surface, "width")), accuracy: 1)
        XCTAssertEqual(surface.frame.height, CGFloat(receipt(surface, "height")), accuracy: 1)
        XCTAssertGreaterThan(receipt(surface, "width"), 500)
        wait { self.receipt(surface, "frames") > 10 }
        assertPhoneCoverage(app)
        let landscapeHash = receipt(surface, "hash")
        surface.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
        wait { self.receipt(surface, "hash") != landscapeHash && self.receipt(surface, "touches") > 0 }
        let landscape = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        landscape.name = "Native landscape"; landscape.lifetime = .keepAlways; add(landscape)
        XCUIDevice.shared.orientation = .portrait
        wait { self.receipt(surface, "height") > self.receipt(surface, "width") }
        let afterRotation = receipt(surface, "revision")
        edit("saved")
        wait { self.receipt(surface, "revision") > afterRotation }
        let saved = receipt(surface, "revision")
        edit("compile-error")
        let error = app.staticTexts["pjm-status"]
        wait { error.exists && error.label.contains("TS") }
        XCTAssertEqual(receipt(surface, "revision"), saved)
        edit("restore")
        wait { self.receipt(surface, "revision") > saved && !error.exists }
        let restored = receipt(surface, "revision")
        edit("runtime-error")
        wait { error.exists && error.label.contains("Intentional guest failure") }
        XCTAssertEqual(receipt(surface, "revision"), restored)
        edit("restore")
        wait { self.receipt(surface, "revision") > restored && !error.exists }
        let screenshot = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        screenshot.name = "Native portrait"
        screenshot.lifetime = .keepAlways
        add(screenshot)
        app.terminate()
    }
    func edit(_ action: String) {
        let expectation = expectation(description: action)
        // Fixture shares the authenticated development server session.
        let url = URL(string: pjmTestURL + "test/" + action)!
        var request = URLRequest(url: url); request.httpMethod = "POST"
        URLSession.shared.dataTask(with: request) { _, response, error in
            XCTAssertNil(error)
            XCTAssertEqual((response as? HTTPURLResponse)?.statusCode, 200)
            expectation.fulfill()
        }.resume()
        waitForExpectations(timeout: 10)
    }
}
