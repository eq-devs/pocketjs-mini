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
    func network(_ title: String, _ app: XCUIApplication) {
        guard pjmNetworkMode else { return }
        if title == "network-initial" && (pjmMediaMode == "deny" || pjmMediaMode == "library" || pjmMediaMode == "cancel") {
            let prompt = app.alerts["Image access"]
            XCTAssertTrue(prompt.waitForExistence(timeout: 30))
            keep("media-consent-" + pjmMediaMode, app, snapshot() ?? [:])
            prompt.buttons[pjmMediaMode == "deny" ? "Don’t allow" : "Allow"].tap()
        }
        if pjmMediaMode == "cancel" && ["network-initial", "network-cold", "network-hot-reload"].contains(title) {
            let cancel = app.buttons["Cancel"].firstMatch
            XCTAssertTrue(cancel.waitForExistence(timeout: 20))
            keep("media-picker-" + title, app, snapshot() ?? [:])
            cancel.tap()
        }
        if pjmMediaMode == "library" && ["network-initial", "network-cold", "network-hot-reload"].contains(title) {
            let photo = app.images.matching(identifier: "PXGGridLayout-Info").firstMatch
            XCTAssertTrue(photo.waitForExistence(timeout: 20))
            keep("media-picker-" + title, app, snapshot() ?? [:])
            photo.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
            let add = app.buttons["Add"].firstMatch
            if add.waitForExistence(timeout: 3) { add.tap() }
        }
        if title == "network-initial" && (pjmLocationMode == "deny" || pjmLocationMode == "allow") {
            let prompt = app.alerts["Location access"]
            XCTAssertTrue(prompt.waitForExistence(timeout: 30))
            keep("location-consent-" + pjmLocationMode, app, snapshot() ?? [:])
            prompt.buttons[pjmLocationMode == "allow" ? "Allow" : "Don’t allow"].tap()
            if pjmLocationMode == "allow" {
                let system = XCUIApplication(bundleIdentifier: "com.apple.springboard")
                let permission = system.alerts.firstMatch
                XCTAssertTrue(permission.waitForExistence(timeout: 15))
                keep("location-system-permission", system, snapshot() ?? [:])
                let allow = permission.buttons["Allow While Using App"]
                XCTAssertTrue(allow.exists)
                allow.tap()
            }
        }
        if title == "network-initial" && !pjmClipboardReadMode.isEmpty && pjmClipboardReadMode != "undeclared" {
            let prompt = app.alerts["Clipboard access"]
            XCTAssertTrue(prompt.waitForExistence(timeout: 30))
            prompt.buttons[pjmClipboardReadMode == "allow" ? "Allow" : "Don’t allow"].tap()
        }
        var current: [String: Any]?
        wait {
            guard let value = self.snapshot() else { return false }
            let content = self.text(value)
            let readOK = pjmClipboardReadMode.isEmpty || content.contains("Clipboard read: " + (pjmClipboardReadMode == "allow" ? "SUCCESS" : "DENIED"))
            let httpOK = !pjmHttpMode || content.range(of: "HTTP: SUCCESS bytes=[0-9]+ domain=DENIED released=DENIED", options: .regularExpression) != nil
            var locationOK = pjmLocationMode.isEmpty || content.contains("Location: DENIED")
            if pjmLocationMode == "allow" {
                let pattern = "Location: SUCCESS (-?[0-9.]+),(-?[0-9.]+)"
                if let expression = try? NSRegularExpression(pattern: pattern), let match = expression.firstMatch(in: content, range: NSRange(content.startIndex..., in: content)),
                   let latRange = Range(match.range(at: 1), in: content), let lonRange = Range(match.range(at: 2), in: content),
                   let latitude = Double(content[latRange]), let longitude = Double(content[lonRange]) {
                    locationOK = abs(latitude - 43.238949) < 0.0001 && abs(longitude - 76.889709) < 0.0001
                } else { locationOK = false }
            }
            let mediaOK = pjmMediaMode.isEmpty || content.contains(pjmMediaMode == "library" ? "Media: SUCCESS JPEG 64x32 released=DENIED" : pjmMediaMode == "cancel" ? "Media: CANCELLED" : "Media: DENIED")
            let fixture = title == "network-hot-reload" ? "reloaded" : "initial"
            if readOK && httpOK && locationOK && mediaOK && content.range(of: "Network: (wifi|cellular|ethernet|other) events: [0-9]+ fixture: " + fixture, options: .regularExpression) != nil && content.contains("Network protocol: PROTOCOL") && content.contains("Clipboard write: SUCCESS protocol: PROTOCOL") { current = value; return true }
            return false
        }
        keep(title, app, current ?? [:])
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
        network("network-initial", app)
        tap("Increment counter", surface); _ = page("Home page", 1)
        tap("Open detail", surface)
        let detail = page("Detail page", 1); XCTAssertTrue(text(detail).contains("Selected item: 42")); keep("detail", app, detail)
        tap("Back to home", surface); keep("back-home", app, page("Home page", 1))
        tap("Open detail", surface); _ = page("Detail page", 1)
        XCUIDevice.shared.press(.home); app.activate()
        XCTAssertTrue(surface.waitForExistence(timeout: 15))
        keep("resumed-detail", app, page("Detail page", 1))
        network("network-resumed", app)
        tap("Back to home", surface); _ = page("Home page", 1)
        app.terminate(); app.launch()
        XCTAssertTrue(surface.waitForExistence(timeout: 30))
        keep("cold-home", app, page("Home page", 0))
        network("network-cold", app)
        XCTAssertFalse(app.staticTexts["pjm-status"].exists)
        if pjmMediaMode == "library" || pjmMediaMode == "cancel" {
            guard let revision = snapshot()?["revision"] as? Int else { XCTFail("No revision for hot reload"); return }
            var request = URLRequest(url: URL(string: pjmTestURL + "device-event")!)
            request.httpMethod = "POST"
            request.httpBody = try! JSONSerialization.data(withJSONObject: ["revision": revision, "platform": "ios", "kind": "log", "level": "info", "message": "test:media-hot-ready"])
            let done = DispatchSemaphore(value: 0)
            var accepted = false
            URLSession.shared.dataTask(with: request) { _, response, _ in accepted = (response as? HTTPURLResponse)?.statusCode == 200; done.signal() }.resume()
            XCTAssertEqual(done.wait(timeout: .now() + 10), .success)
            XCTAssertTrue(accepted)
            // Keep this same application open while the host watcher replaces the guest.
            network("network-hot-reload", app)
        }
    }
}
