import XCTest
final class MiniTests: XCTestCase {
    func testNativeSignedPackageMatrixAndRetainedIsolation() {
        continueAfterFailure = false
        let app = XCUIApplication(); app.launch()
        let proof = app.staticTexts["package-matrix-proof"]
        XCTAssertTrue(proof.waitForExistence(timeout: 30))
        let complete = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in
            proof.label.contains("native-package-matrix PASS") || proof.label.contains("native-package-matrix FAIL")
        }, object: nil)
        XCTAssertEqual(XCTWaiter.wait(for: [complete], timeout: 120), .completed)
        XCTAssertTrue(proof.label.hasPrefix("native-package-matrix PASS "), proof.label)
        let data = Data(proof.label.dropFirst("native-package-matrix PASS ".count).utf8)
        let receipt = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        XCTAssertEqual(receipt?["nativePackageDownloadActualTLS"] as? Bool, pjmPackageActualTLS)
        XCTAssertEqual(receipt?["nativePackageDownloadControlled"] as? Bool, true)
        XCTAssertEqual(receipt?["cases"] as? Int, pjmPackageCaseCount)
        XCTAssertEqual(receipt?["accepted"] as? Int, 1)
        XCTAssertEqual(receipt?["rejected"] as? Int, pjmPackageCaseCount - 1)
        let verdicts = receipt?["verdicts"] as? [[String: String]]
        XCTAssertEqual(Set(verdicts?.compactMap { $0["name"] } ?? []), Set(pjmPackageCaseNames))
        let attacks = receipt?["runtimeAttacks"] as? [[String: Any]]
        XCTAssertEqual(Set(attacks?.compactMap { $0["name"] as? String } ?? []), Set(["infinite-frame-loop", "heap-limit"]))
        XCTAssertEqual(attacks?.count, 2)
        for attack in attacks ?? [] {
            XCTAssertEqual(attack["healthyGenerationRetained"] as? Bool, true)
            XCTAssertLessThan(attack["elapsedMs"] as? Double ?? .infinity, 5000)
        }
        let attachment = XCTAttachment(data: data, uniformTypeIdentifier: "public.json"); attachment.name = "package-matrix-result"; attachment.lifetime = .keepAlways; add(attachment)
    }
}
