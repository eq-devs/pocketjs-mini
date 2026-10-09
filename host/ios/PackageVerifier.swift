import Foundation
import CryptoKit

@objc(MiniPackageVerifier)
public final class NativePackageVerifier: NSObject {
    @objc(parseStrictJSON:error:) public static func parseStrictJSON(_ data: Data) throws -> Any { try StrictPackageJSON.parse(data) }
    @objc(canonicalJSON:error:) public static func canonicalJSON(_ value: Any) throws -> Data { try CanonicalPackageJSON.data(value) }
    @objc public static func verifyPlanHash(_ plan: NSDictionary) throws {
        guard var body = plan as? [String: Any], let expected = body.removeValue(forKey: "planHash") as? String,
              expected.range(of: "^sha256:[a-f0-9]{64}$", options: .regularExpression) != nil else {
            throw PackageVerifier.Failure.rejected("Build plan hash envelope")
        }
        let bytes = try CanonicalPackageJSON.data(body)
        let actual = "sha256:" + SHA256.hash(data: bytes).map { String(format: "%02x", $0) }.joined()
        guard actual == expected else { throw PackageVerifier.Failure.rejected("Build plan hash mismatch") }
    }
    @objc public static func verify(payload: Data, envelope: Data, trustedKey: Data, abi: Int, target: String) throws -> NSDictionary {
        try PackageVerifier.verify(payload: payload, envelope: envelope, trustedKey: trustedKey, abi: abi, target: target) as NSDictionary
    }
}

/// Match the pinned compiler's JSON.stringify number spelling and UTF-16 key order.
private enum CanonicalPackageJSON {
    static func data(_ value: Any) throws -> Data {
        Data(try text(value).utf8)
    }
    static func rejected(_ reason: String) -> PackageVerifier.Failure { .rejected("Canonical JSON \(reason)") }
    static func quote(_ value: String) throws -> String {
        let encoded = try JSONSerialization.data(withJSONObject: [value], options: [.withoutEscapingSlashes])
        guard var result = String(data: encoded, encoding: .utf8), result.first == "[", result.last == "]" else { throw rejected("string") }
        result.removeFirst(); result.removeLast(); return result
    }
    static func less(_ lhs: String, _ rhs: String) -> Bool {
        lhs.utf16.lexicographicallyPrecedes(rhs.utf16)
    }
    static func number(_ value: Double) throws -> String {
        guard value.isFinite else { throw rejected("number") }
        if value == 0 { return "0" }
        let negative = value < 0, magnitude = abs(value)
        let raw = String(magnitude).lowercased()
        let halves = raw.split(separator: "e", maxSplits: 1, omittingEmptySubsequences: false)
        var significand = String(halves[0])
        if significand.hasSuffix(".0") { significand.removeLast(2) }
        let exponent = halves.count == 2 ? Int(halves[1])! : 0
        let point = significand.firstIndex(of: ".")
        let integerDigits = point.map { significand.distance(from: significand.startIndex, to: $0) } ?? significand.count
        let digits = significand.filter { $0 != "." }
        let decimal = integerDigits + exponent
        let body: String
        if magnitude >= 0.000001 && magnitude < 1e21 {
            if decimal <= 0 { body = "0." + String(repeating: "0", count: -decimal) + digits }
            else if decimal >= digits.count { body = digits + String(repeating: "0", count: decimal - digits.count) }
            else {
                let split = digits.index(digits.startIndex, offsetBy: decimal)
                body = String(digits[..<split]) + "." + String(digits[split...])
            }
        } else {
            let rest = digits.dropFirst()
            body = String(digits.first!) + (rest.isEmpty ? "" : "." + rest) + "e" + (decimal - 1 >= 0 ? "+" : "") + String(decimal - 1)
        }
        return negative ? "-" + body : body
    }
    static func text(_ value: Any) throws -> String {
        if value is NSNull { return "null" }
        if let value = value as? String { return try quote(value) }
        if let value = value as? NSNumber {
            if CFGetTypeID(value) == CFBooleanGetTypeID() { return value.boolValue ? "true" : "false" }
            return try number(value.doubleValue)
        }
        if let value = value as? [Any] { return "[" + (try value.map(text)).joined(separator: ",") + "]" }
        if let value = value as? [String: Any] {
            return "{" + (try value.keys.sorted(by: less).map { try quote($0) + ":" + text(value[$0]!) }).joined(separator: ",") + "}"
        }
        throw rejected("value")
    }
}

/// Validate bytes before Foundation parsing discards duplicate object keys.
private struct StrictPackageJSON {
    let bytes: [UInt8]
    var index = 0
    var tokens = 0
    static func parse(_ data: Data) throws -> Any {
        guard String(data: data, encoding: .utf8) != nil else { throw PackageVerifier.Failure.rejected("JSON UTF-8") }
        var parser = StrictPackageJSON(bytes: Array(data))
        try parser.value(0); parser.space()
        guard parser.index == parser.bytes.count else { throw PackageVerifier.Failure.rejected("JSON trailing bytes") }
        return try JSONSerialization.jsonObject(with: data, options: [.fragmentsAllowed])
    }
    func rejected() -> PackageVerifier.Failure { .rejected("Strict JSON grammar") }
    mutating func tick() throws { tokens += 1; if tokens > 262144 { throw rejected() } }
    mutating func space() { while index < bytes.count && [UInt8(32),9,10,13].contains(bytes[index]) { index += 1 } }
    mutating func take(_ byte: UInt8) -> Bool { if index < bytes.count && bytes[index] == byte { index += 1; return true }; return false }
    mutating func hex() throws -> UInt16 {
        var result: UInt16 = 0
        for _ in 0..<4 {
            guard index < bytes.count else { throw rejected() }; let byte = bytes[index]; index += 1
            let digit: UInt8
            switch byte { case 48...57: digit = byte - 48; case 65...70: digit = byte - 55; case 97...102: digit = byte - 87; default: throw rejected() }
            result = result * 16 + UInt16(digit)
        }; return result
    }
    mutating func string() throws -> Data {
        try tick(); let start = index; guard take(34) else { throw rejected() }
        while index < bytes.count {
            let byte = bytes[index]; index += 1
            if byte == 34 {
                let value = try JSONSerialization.jsonObject(with: Data(bytes[start..<index]), options: [.fragmentsAllowed])
                guard let text = value as? String else { throw rejected() }; return Data(text.utf8)
            }
            if byte < 32 { throw rejected() }
            if byte == 92 {
                guard index < bytes.count else { throw rejected() }; let escape = bytes[index]; index += 1
                if escape == 117 {
                    let code = try hex()
                    if (0xd800...0xdbff).contains(code) { guard take(92), take(117) else { throw rejected() }; let low = try hex(); guard (0xdc00...0xdfff).contains(low) else { throw rejected() } }
                    else if (0xdc00...0xdfff).contains(code) { throw rejected() }
                } else if ![UInt8(34),92,47,98,102,110,114,116].contains(escape) { throw rejected() }
            }
        }; throw rejected()
    }
    mutating func value(_ depth: Int) throws {
        guard depth <= 32 else { throw rejected() }; space(); guard index < bytes.count else { throw rejected() }
        if bytes[index] == 34 { _ = try string(); return }; try tick()
        if bytes[index] == 123 || bytes[index] == 91 {
            let object = bytes[index] == 123, end: UInt8 = object ? 125 : 93; index += 1; space(); if take(end) { return }; var keys = Set<Data>()
            while true {
                space(); if object { let key = try string(); guard keys.insert(key).inserted else { throw rejected() }; space(); guard take(58) else { throw rejected() } }
                try value(depth + 1); space(); if take(end) { return }; guard take(44) else { throw rejected() }
            }
        }
        for literal in [Array("true".utf8), Array("false".utf8), Array("null".utf8)] {
            if index + literal.count <= bytes.count && Array(bytes[index..<index+literal.count]) == literal { index += literal.count; return }
        }
        let start = index; _ = take(45)
        if !take(48) { guard index < bytes.count && (49...57).contains(bytes[index]) else { throw rejected() }; repeat { index += 1 } while index < bytes.count && (48...57).contains(bytes[index]) }
        if take(46) { guard index < bytes.count && (48...57).contains(bytes[index]) else { throw rejected() }; repeat { index += 1 } while index < bytes.count && (48...57).contains(bytes[index]) }
        if take(101) || take(69) { if !take(43) { _ = take(45) }; guard index < bytes.count && (48...57).contains(bytes[index]) else { throw rejected() }; repeat { index += 1 } while index < bytes.count && (48...57).contains(bytes[index]) }
        guard index - start <= 128, let number = Double(String(decoding: bytes[start..<index], as: UTF8.self)), number.isFinite else { throw rejected() }
    }
}

/// Verification accepts a host-provisioned raw Ed25519 key, never an envelope key.
enum PackageVerifier {
    enum Failure: Error { case rejected(String) }
    static func verify(payload: Data, envelope: Data, trustedKey: Data, abi: Int, target: String) throws -> [String: Any] {
        func require(_ condition: Bool, _ message: String) throws {
            if !condition { throw Failure.rejected(message) }
        }
        func matches(_ value: String, _ pattern: String) -> Bool {
            value.range(of: pattern, options: .regularExpression) != nil
        }
        try require(!payload.isEmpty && payload.count <= 64 * 1024 * 1024 && envelope.count <= 64 * 1024, "Package size")
        guard var manifest = try StrictPackageJSON.parse(envelope) as? [String: Any] else { throw Failure.rejected("Manifest object") }
        try require(Set(manifest.keys) == Set(["appId", "version", "minHostAbi", "entry", "pages", "permissions", "domains", "targets", "format", "sha256", "signature"]), "Manifest fields")
        func string(_ key: String) throws -> String {
            guard let value = manifest[key] as? String else { throw Failure.rejected(key) }; return value
        }
        func list(_ key: String, _ maximum: Int) throws -> [String] {
            guard let value = manifest[key] as? [String], value.count <= maximum, Set(value).count == value.count else { throw Failure.rejected(key) }; return value
        }
        func integer(_ key: String) throws -> Int {
            guard let value = manifest[key] as? NSNumber, CFGetTypeID(value) != CFBooleanGetTypeID(), value.doubleValue >= 1, value.doubleValue <= 9007199254740991, value.doubleValue.rounded() == value.doubleValue else { throw Failure.rejected(key) }; return value.intValue
        }
        let app = try string("appId"), version = try string("version")
        try require(app.utf16.count <= 128 && matches(app, "^[a-zA-Z][a-zA-Z0-9_-]*(?:\\.[a-zA-Z][a-zA-Z0-9_-]*)+$"), "App identity")
        try require(version.utf16.count <= 64 && matches(version, "^(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)$"), "Version")
        try require(try integer("format") == 1, "Format")
        let minimum = try integer("minHostAbi")
        try require(try string("entry") == "main.pocket", "Entry")
        let pages = try list("pages", 128)
        try require(pages.contains("/") && pages.allSatisfy { matches($0, "^/(?:[a-zA-Z0-9_-]+(?:/[a-zA-Z0-9_-]+)*)?$") }, "Pages")
        let permissions = try list("permissions", 16)
        try require(permissions.allSatisfy { ["clipboard.read", "media", "location"].contains($0) }, "Permissions")
        let domains = try list("domains", 128)
        try require(domains.allSatisfy { $0.count <= 253 && matches($0, "^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\\.)+[a-z]{2,63}$") && $0.split(separator: ".").allSatisfy { $0.count <= 63 } }, "Domains")
        let targets = try list("targets", 2)
        try require(!targets.isEmpty && targets.allSatisfy { ["pjm-ios", "pjm-android"].contains($0) }, "Targets")
        let digest = try string("sha256"), signatureText = try string("signature")
        try require(matches(digest, "^[a-f0-9]{64}$") && matches(signatureText, "^[A-Za-z0-9+/]{86}==$"), "Signature envelope")
        let actual = SHA256.hash(data: payload).map { String(format: "%02x", $0) }.joined()
        try require(actual == digest, "Payload digest")
        guard let signature = Data(base64Encoded: signatureText), trustedKey.count == 32 else { throw Failure.rejected("Trusted key") }
        manifest.removeValue(forKey: "signature")
        let canonical = try CanonicalPackageJSON.data(manifest)
        let key = try Curve25519.Signing.PublicKey(rawRepresentation: trustedKey)
        try require(key.isValidSignature(signature, for: canonical), "Publisher signature")
        try require(abi >= minimum && targets.contains(target), "Host compatibility")
        manifest["signature"] = signatureText
        return manifest
    }
}
