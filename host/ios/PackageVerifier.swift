import Foundation
import CryptoKit

@objc(MiniPackageVerifier)
public final class NativePackageVerifier: NSObject {
    @objc public static func verifyPlanHash(_ plan: NSDictionary) throws {
        guard var body = plan as? [String: Any], let expected = body.removeValue(forKey: "planHash") as? String,
              expected.range(of: "^sha256:[a-f0-9]{64}$", options: .regularExpression) != nil else {
            throw PackageVerifier.Failure.rejected("Build plan hash envelope")
        }
        let bytes = try JSONSerialization.data(withJSONObject: body, options: [.sortedKeys, .withoutEscapingSlashes])
        let actual = "sha256:" + SHA256.hash(data: bytes).map { String(format: "%02x", $0) }.joined()
        guard actual == expected else { throw PackageVerifier.Failure.rejected("Build plan hash mismatch") }
    }
    @objc public static func verify(payload: Data, envelope: Data, trustedKey: Data, abi: Int, target: String) throws -> NSDictionary {
        try PackageVerifier.verify(payload: payload, envelope: envelope, trustedKey: trustedKey, abi: abi, target: target) as NSDictionary
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
        guard var manifest = try JSONSerialization.jsonObject(with: envelope) as? [String: Any] else { throw Failure.rejected("Manifest object") }
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
        let canonical = try JSONSerialization.data(withJSONObject: manifest, options: [.sortedKeys, .withoutEscapingSlashes])
        let key = try Curve25519.Signing.PublicKey(rawRepresentation: trustedKey)
        try require(key.isValidSignature(signature, for: canonical), "Publisher signature")
        try require(abi >= minimum && targets.contains(target), "Host compatibility")
        manifest["signature"] = signatureText
        return manifest
    }
}
