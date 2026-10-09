import XCTest

final class InspectionPump {
    private let lock = NSLock()
    private var stopped = false
    let done = DispatchSemaphore(value: 0)
    func stop() { lock.lock(); stopped = true; lock.unlock() }
    func active() -> Bool { lock.lock(); defer { lock.unlock() }; return !stopped }
}

final class MiniTests: XCTestCase {
    func request(_ path: String, _ body: [String: Any]? = nil) -> [String: Any]? {
        var request = URLRequest(url: URL(string: pjmTestURL + path)!)
        request.timeoutInterval = 5
        if let body = body { request.httpMethod = "POST"; request.httpBody = try? JSONSerialization.data(withJSONObject: body) }
        let done = DispatchSemaphore(value: 0)
        var result: [String: Any]?
        URLSession.shared.dataTask(with: request) { data, response, _ in
            if (response as? HTTPURLResponse)?.statusCode == 200, let data = data {
                result = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
            }
            done.signal()
        }.resume()
        _ = done.wait(timeout: .now() + 6)
        return result
    }
    func number(_ surface: XCUIElement, _ key: String) -> Int {
        let tokens = (surface.value as? String ?? "").split(separator: " ")
        return tokens.first { $0.hasPrefix(key + "=") }.flatMap { Int($0.split(separator: "=")[1]) } ?? 0
    }
    func wait(_ condition: @escaping () -> Bool) {
        XCTAssertEqual(XCTWaiter.wait(for: [XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in condition() }, object: nil)], timeout: 45), .completed)
    }
    func testRecordedTouchAndLifecycle() {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments = ["--pjm-url", pjmTestURL, "--pjm-record", "--pjm-inspect"]
        app.launch()
        let surface = app.otherElements["pocket-surface"]
        XCTAssertTrue(surface.waitForExistence(timeout: 30))
        wait { self.number(surface, "frames") > 3 }
        surface.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
        wait { self.number(surface, "touches") > 0 }
        XCUIDevice.shared.press(.home)
        app.activate()
        XCTAssertTrue(surface.waitForExistence(timeout: 15))
        XCTAssertEqual(number(surface, "highlight"), 0)
        wait { self.number(surface, "frames") >= 60 }
        var selected = false
        for _ in 0..<30 {
            if let snapshot = request("inspection"), let revision = snapshot["revision"], let frame = snapshot["frame"] {
                _ = request("inspection/select", ["revision": revision, "frame": frame, "nodeId": 1])
                if number(surface, "highlight") == 1 { selected = true; break }
            }
            Thread.sleep(forTimeInterval: 0.1)
        }
        XCTAssertTrue(selected, "Native overlay did not reflect the selected root")
        let highlighted = XCTAttachment(screenshot: app.screenshot())
        highlighted.name = "native-inspection-highlight"; highlighted.lifetime = .keepAlways; add(highlighted)
        if let snapshot = request("inspection"), let revision = snapshot["revision"], let frame = snapshot["frame"] {
            _ = request("inspection/select", ["revision": revision, "frame": frame, "nodeId": 0])
        }
        wait { self.number(surface, "highlight") == 0 }
        let cleared = XCTAttachment(screenshot: app.screenshot())
        cleared.name = "native-inspection-cleared"; cleared.lifetime = .keepAlways; add(cleared)
        if let tree = request("inspection")?["tree"] as? [String: Any], let nodes = tree["nodes"] as? [[String: Any]], nodes.contains(where: { ($0["text"] as? String) == "inspection-rotated" }) {
            for label in ["inspection-rotated", "inspection-clipped", "inspection-projected"] {
                guard let node = nodes.first(where: { ($0["text"] as? String) == label }), let id = node["parent"] as? Int else { XCTFail("Missing geometry node " + label); return }
                let pump = InspectionPump()
                DispatchQueue.global().async {
                    defer { pump.done.signal() }
                    while pump.active() {
                        if let snapshot = self.request("inspection"), let revision = snapshot["revision"], let frame = snapshot["frame"] {
                            _ = self.request("inspection/select", ["revision": revision, "frame": frame, "nodeId": id])
                        }
                        Thread.sleep(forTimeInterval: 0.1)
                    }
                }
                wait { self.number(surface, "highlight") == id }
                let shot = XCTAttachment(screenshot: app.screenshot()); shot.name = label; shot.lifetime = .keepAlways; add(shot)
                pump.stop(); XCTAssertEqual(pump.done.wait(timeout: .now() + 8), .success)
            }
            if let snapshot = request("inspection"), let revision = snapshot["revision"], let frame = snapshot["frame"] { _ = request("inspection/select", ["revision": revision, "frame": frame, "nodeId": 0]) }
            wait { self.number(surface, "highlight") == 0 }
        }
        wait { self.number(surface, "frames") >= 600 }
        XCTAssertFalse(app.staticTexts["pjm-status"].exists)
    }
}
