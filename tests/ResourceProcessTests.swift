import XCTest
final class MiniTests: XCTestCase {
    func testProcessCapacityAndGenerationRetirement() {
        continueAfterFailure = false
        let app = XCUIApplication(); app.launch()
        let proof = app.staticTexts["resource-process-proof"]
        XCTAssertTrue(proof.waitForExistence(timeout: 30))
        let complete = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in
            proof.label.contains("native-resource-process PASS") || proof.label.contains("native-resource-process FAIL")
        }, object: nil)
        XCTAssertEqual(XCTWaiter.wait(for: [complete], timeout: 120), .completed)
        XCTAssertTrue(proof.label.hasPrefix("native-resource-process PASS "), proof.label)
        let data = Data(proof.label.dropFirst("native-resource-process PASS ".count).utf8)
        let result = try? JSONSerialization.jsonObject(with: data) as? [String: Int]
        XCTAssertEqual(result?["controllers"], 6); XCTAssertEqual(result?["rounds"], 32)
        XCTAssertEqual(result?["processCap"], 16); XCTAssertEqual(result?["perGenerationCap"], 4)
        XCTAssertEqual(result?["nativeGenerationRetirements"], 256)
        XCTAssertEqual(result?["authenticatedIdentities"], 4); XCTAssertEqual(result?["scenarios"], 2)
        let receipt = XCTAttachment(data: data, uniformTypeIdentifier: "public.json"); receipt.name = "resource-process-result"; receipt.lifetime = .keepAlways; add(receipt)
        let image = XCTAttachment(screenshot: app.screenshot()); image.name = "resource-process-proof"; image.lifetime = .keepAlways; add(image)
    }
}
