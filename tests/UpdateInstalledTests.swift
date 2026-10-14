import XCTest
import UIKit
final class MiniTests: XCTestCase {
    func wait(_ surface: XCUIElement, _ expected: String) {
        XCTAssertEqual(XCTWaiter.wait(for: [XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in
            surface.exists && (surface.value as? String) == expected
        }, object: nil)], timeout: 30), .completed, "Expected \(expected); got \(String(describing: surface.value))")
    }
    func keep(_ app: XCUIApplication, _ surface: XCUIElement, _ name: String, green: Bool) {
        let screenshot = app.screenshot(), image = screenshot.image
        let shot = XCTAttachment(screenshot: screenshot); shot.name = name; shot.lifetime = .keepAlways; add(shot)
        let proof = XCTAttachment(string: surface.value as? String ?? "missing"); proof.name = name + "-proof"; proof.lifetime = .keepAlways; add(proof)
        guard let cg = image.cgImage else { XCTFail("Missing pixels"); return }
        let frame = surface.frame, point = CGPoint(x: frame.minX + frame.width * 0.15, y: frame.minY + frame.height * 0.15)
        let scale = CGFloat(cg.width) / image.size.width
        guard let pixel = cg.cropping(to: CGRect(x: point.x * scale, y: point.y * scale, width: 1, height: 1)) else { XCTFail("Missing crop"); return }
        var rgba = [UInt8](repeating: 0, count: 4)
        let context = CGContext(data: &rgba, width: 1, height: 1, bitsPerComponent: 8, bytesPerRow: 4, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
        context.draw(pixel, in: CGRect(x: 0, y: 0, width: 1, height: 1))
        if green { XCTAssertGreaterThan(rgba[1], 110); XCTAssertLessThan(rgba[0], 90) }
        else { XCTAssertGreaterThan(rgba[0], 160); XCTAssertLessThan(rgba[1], 100) }
    }
    func testInstalledSignedUpdateRetainsRunningGuestAndActivatesCold() {
        continueAfterFailure = false; XCUIDevice.shared.orientation = .portrait
        let app = XCUIApplication(); app.launch()
        let surface = app.otherElements["pjm-signed-surface"]
        XCTAssertTrue(surface.waitForExistence(timeout: 20))
        if pjmUpdatePhase == "baseline" {
            wait(surface, "running=1.0.0 guest=1.0.0 count=0 current=1.0.0 pending=none")
            keep(app, surface, "old-key-host", green: false)
            return
        }
        if pjmUpdatePhase == "revoked" {
            wait(surface, "running=2.0.0 guest=2.0.0 count=0 current=2.0.0 pending=none")
            let download = app.staticTexts["update-download-result"]
            XCTAssertEqual(XCTWaiter.wait(for: [XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in download.exists && download.label == "rejected-state-unchanged" }, object: nil)], timeout: 30), .completed)
            keep(app, surface, "revoked-old-key", green: true)
            app.buttons["update-rollback"].tap()
            XCTAssertTrue(app.buttons["update-rollback-rejected-state-unchanged"].waitForExistence(timeout: 10))
            app.terminate(); app.launch()
            wait(surface, "running=2.0.0 guest=2.0.0 count=0 current=2.0.0 pending=none")
            XCTAssertEqual(XCTWaiter.wait(for: [XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in download.exists && download.label == "rejected-state-unchanged" }, object: nil)], timeout: 30), .completed)
            keep(app, surface, "revoked-cold-new-screen", green: true)
            return
        }
        wait(surface, "running=1.0.0 guest=1.0.0 count=0 current=1.0.0 pending=2.0.0")
        keep(app, surface, "staged-old-screen", green: false)
        let point = pjmUpdateTap, frame = surface.frame
        let scale = min(frame.width / 402, frame.height / 778)
        surface.coordinate(withNormalizedOffset: CGVector(dx: ((frame.width - 402 * scale) / 2 + CGFloat(point[0]) * scale) / frame.width, dy: ((frame.height - 778 * scale) / 2 + CGFloat(point[1]) * scale) / frame.height)).tap()
        wait(surface, "running=1.0.0 guest=1.0.0 count=1 current=1.0.0 pending=2.0.0")
        XCUIDevice.shared.press(.home); app.activate()
        wait(surface, "running=1.0.0 guest=1.0.0 count=1 current=1.0.0 pending=2.0.0")
        keep(app, surface, "staged-retained-counter", green: false)
        app.terminate(); app.launch()
        wait(surface, "running=2.0.0 guest=2.0.0 count=0 current=2.0.0 pending=2.0.0")
        keep(app, surface, "cold-updated-screen", green: true)
        app.buttons["update-rollback"].tap()
        wait(surface, "running=2.0.0 guest=2.0.0 count=0 current=2.0.0 pending=1.0.0")
        app.terminate(); app.launch()
        wait(surface, "running=1.0.0 guest=1.0.0 count=0 current=1.0.0 pending=2.0.0")
        keep(app, surface, "cold-rollback-screen", green: false)
        if pjmUpdatePhase == "overlap" {
            app.terminate(); app.launch()
            wait(surface, "running=2.0.0 guest=2.0.0 count=0 current=2.0.0 pending=2.0.0")
            keep(app, surface, "new-key-before-revocation", green: true)
        }
    }
}
