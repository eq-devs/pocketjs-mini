import XCTest
final class MiniTests: XCTestCase {
    func testActualHTTPSProcessCapacityAndRetirement() throws {
        continueAfterFailure = false
        let app = XCUIApplication(); app.launch()
        let proof = app.staticTexts["http-process-proof"]
        XCTAssertTrue(proof.waitForExistence(timeout: 30))
        let complete = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in
            proof.label.contains("native-http-process PASS") || proof.label.contains("native-http-process FAIL")
        }, object: nil)
        XCTAssertEqual(XCTWaiter.wait(for: [complete], timeout: 150), .completed)
        XCTAssertTrue(proof.label.hasPrefix("native-http-process PASS "), proof.label)
        let data = Data(proof.label.dropFirst("native-http-process PASS ".count).utf8)
        let result = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        for (key, expected) in ["authenticatedIdentities": 4, "waves": 2, "actualHttpsResponses": 32, "peakRunningURLSessionTasks": 16, "globalResourceDenials": 4, "nativeGenerationRetirements": 8, "inFlightHttpsRetirements": 16, "cancellationHttpsHeaders": 16, "verifiedGuestReplies": 32, "staleContainerPostDenials": 32, "releasedResources": 16, "processCap": 16] {
            XCTAssertEqual(result[key] as? Int, expected, key)
        }
        XCTAssertGreaterThan(result["responseBytesRead"] as? Int ?? 0, 0)
        XCTAssertEqual(result["defaultTlsTrust"] as? Bool, true)
        XCTAssertEqual(result["controlledTransport"] as? Bool, false)
        XCTAssertEqual(result["controlledTiming"] as? Bool, true)
        XCTAssertEqual(result["foreignReadAndReleaseDenied"] as? Bool, true)
        let receipt = XCTAttachment(data: data, uniformTypeIdentifier: "public.json"); receipt.name = "http-process-result"; receipt.lifetime = .keepAlways; add(receipt)
        let image = XCTAttachment(screenshot: app.screenshot()); image.name = "http-process-proof"; image.lifetime = .keepAlways; add(image)
    }
}
