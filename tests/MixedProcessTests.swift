import XCTest
final class MiniTests: XCTestCase {
    func testMixedHTTPImageNativeRetirement() throws {
        continueAfterFailure = false
        let app = XCUIApplication(); app.launch()
        let proof = app.staticTexts["mixed-process-proof"]
        XCTAssertTrue(proof.waitForExistence(timeout: 30))
        let complete = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in
            proof.label.contains("native-mixed-process PASS") || proof.label.contains("native-mixed-process FAIL")
        }, object: nil)
        XCTAssertEqual(XCTWaiter.wait(for: [complete], timeout: 150), .completed)
        XCTAssertTrue(proof.label.hasPrefix("native-mixed-process PASS "), proof.label)
        let data = Data(proof.label.dropFirst("native-mixed-process PASS ".count).utf8)
        let result = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        for (key, expected) in ["authenticatedIdentities": 4, "mixedStages": 3, "mixedSuccessfulHttpsResponses": 30, "mixedJpegResponses": 2, "verifiedGuestReplies": 32, "mixedResourceCapacityDenials": 6, "nativeGenerationRetirements": 4, "staleContainerPostDenials": 16, "mixedInFlightHttpRetirements": 15, "mixedInFlightMediaRetirements": 1, "peakRunningURLSessionTasks": 15, "peakImageProviderWorkers": 1, "mediaBusyDenials": 1, "cancelledMediaRetainedCapacityDenials": 1, "processCap": 16] {
            XCTAssertEqual(result[key] as? Int, expected, key)
        }
        for key in ["syntheticMediaProvider", "controlledTiming", "defaultTlsTrust", "foreignReadAndReleaseDenied"] { XCTAssertEqual(result[key] as? Bool, true, key) }
        XCTAssertEqual(result["controlledTransport"] as? Bool, false)
        let receipt = XCTAttachment(data: data, uniformTypeIdentifier: "public.json"); receipt.name = "mixed-process-result"; receipt.lifetime = .keepAlways; add(receipt)
        let image = XCTAttachment(screenshot: app.screenshot()); image.name = "mixed-process-proof"; image.lifetime = .keepAlways; add(image)
    }
}
