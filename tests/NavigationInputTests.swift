import XCTest

final class MiniTests: XCTestCase {
    func snapshot() -> [String: Any]? {
        var request = URLRequest(url: URL(string: pjmTestURL + "inspection")!)
        request.timeoutInterval = 5
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
    func nodes(_ snapshot: [String: Any]) -> [[String: Any]] {
        return (snapshot["tree"] as? [String: Any])?["nodes"] as? [[String: Any]] ?? []
    }
    func text(_ snapshot: [String: Any]) -> String {
        return nodes(snapshot).map { $0["text"] as? String ?? "" }.joined()
    }
    func wait(_ condition: @escaping () -> Bool) {
        XCTAssertEqual(XCTWaiter.wait(for: [XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in condition() }, object: nil)], timeout: 90), .completed)
    }
    func page(_ title: String, _ counter: Int) -> [String: Any] {
        var current: [String: Any]?
        wait {
            guard let value = self.snapshot() else { return false }
            let content = self.text(value)
            if content.contains(title) && content.contains((title == "Home page" ? "Home" : "Saved") + " counter: " + String(counter)) { current = value; return true }
            return false
        }
        XCTAssertEqual(current?["platform"] as? String, "ios")
        return current ?? [:]
    }
    func tap(_ title: String, _ surface: XCUIElement) {
        guard let value = snapshot() else { XCTFail("No native snapshot"); return }
        let list = nodes(value)
        guard let marker = list.first(where: { ($0["text"] as? String) == title }), let parent = marker["parent"] as? Int,
              let bounds = list.first(where: { ($0["id"] as? Int) == parent })?["bounds"] as? [Double], bounds.count == 4,
              let root = list.first(where: { ($0["id"] as? Int) == 1 })?["bounds"] as? [Double], root.count == 4 else { XCTFail("Missing button bounds " + title); return }
        surface.coordinate(withNormalizedOffset: CGVector(dx: (bounds[0] + bounds[2] / 2) / root[2], dy: (bounds[1] + bounds[3] / 2) / root[3])).tap()
    }
    func keep(_ title: String, _ app: XCUIApplication, _ value: [String: Any]) {
        let shot = XCTAttachment(screenshot: app.screenshot()); shot.name = title; shot.lifetime = .keepAlways; add(shot)
        if let data = try? JSONSerialization.data(withJSONObject: value) {
            let tree = XCTAttachment(data: data, uniformTypeIdentifier: "public.json"); tree.name = title + "-tree"; tree.lifetime = .keepAlways; add(tree)
        }
    }
    func testTsxNavigationAndRetainedState() {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments = ["--pjm-url", pjmTestURL, "--pjm-inspect"]
        app.launch()
        let surface = app.otherElements["pocket-surface"]
        XCTAssertTrue(surface.waitForExistence(timeout: 30))
        keep("home", app, page("Home page", 0))
        tap("Increment counter", surface); _ = page("Home page", 1)
        tap("Open detail", surface)
        let detail = page("Detail page", 1); XCTAssertTrue(text(detail).contains("Selected item: 42")); keep("detail", app, detail)
        tap("Back to home", surface); keep("back-home", app, page("Home page", 1))
        tap("Open detail", surface); _ = page("Detail page", 1)
        XCUIDevice.shared.press(.home); app.activate()
        XCTAssertTrue(surface.waitForExistence(timeout: 15))
        keep("resumed-detail", app, page("Detail page", 1))
        tap("Back to home", surface); _ = page("Home page", 1)
        app.terminate(); app.launch()
        XCTAssertTrue(surface.waitForExistence(timeout: 30))
        keep("cold-home", app, page("Home page", 0))
        XCTAssertFalse(app.staticTexts["pjm-status"].exists)
    }
}
