import Foundation
@main struct PackageChecks {
    static func main() throws {
        let data = try Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[1]))
        let cases = try JSONSerialization.jsonObject(with: data) as! [[String: Any]]
        for (index, item) in cases.enumerated() {
            let payload = Data(base64Encoded: item["payload"] as! String)!
            let key = Data(base64Encoded: item["key"] as! String)!
            let envelope = try (item["rawEnvelopeBase64"] as? String).flatMap { Data(base64Encoded: $0) } ?? (JSONSerialization.data(withJSONObject: item["manifest"]!))
            var accepted = false
            do {
                _ = try PackageVerifier.verify(payload: payload, envelope: envelope, trustedKey: key, abi: item["abi"] as! Int, target: item["target"] as! String)
                accepted = true
            } catch { }
            if accepted != item["valid"] as! Bool { print("Unexpected admission: \(index), bytes \(Array(envelope.prefix(8)))"); fflush(stdout) }
            precondition(accepted == item["valid"] as! Bool, "Package case \(index)")
        }
        let validJSON = ["{}", "[true,false,null,-1.5e2]", "\"\\ud83d\\ude00\"", "{\"a\":{\"a\":1}}"]
        for text in validJSON { _ = try NativePackageVerifier.parseStrictJSON(Data(text.utf8)) }
        let invalidJSON = ["{\"a\":1,\"\\u0061\":2}", "[1,]", "01", "1e999", "\"\\udc00\"", "\"\\ud800\"", String(repeating: "[", count: 34) + "0" + String(repeating: "]", count: 34), String(repeating: "1", count: 129)]
        for text in invalidJSON { var rejected = false; do { _ = try NativePackageVerifier.parseStrictJSON(Data(text.utf8)) } catch { rejected = true }; precondition(rejected, "Strict JSON rejection") }
        var invalidUTF8Rejected = false
        do { _ = try NativePackageVerifier.parseStrictJSON(Data([34,255,34])) } catch { invalidUTF8Rejected = true }
        precondition(invalidUTF8Rejected)
        print("Native iOS package verification: \(cases.count) interoperability and rejection cases passed")
    }
}
