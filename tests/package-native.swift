import Foundation
@main struct PackageChecks {
    static func main() throws {
        let data = try Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[1]))
        let cases = try JSONSerialization.jsonObject(with: data) as! [[String: Any]]
        for (index, item) in cases.enumerated() {
            let payload = Data(base64Encoded: item["payload"] as! String)!
            let key = Data(base64Encoded: item["key"] as! String)!
            let envelope = try JSONSerialization.data(withJSONObject: item["manifest"]!)
            var accepted = false
            do {
                _ = try PackageVerifier.verify(payload: payload, envelope: envelope, trustedKey: key, abi: item["abi"] as! Int, target: item["target"] as! String)
                accepted = true
            } catch { }
            precondition(accepted == item["valid"] as! Bool, "Package case \(index)")
        }
        print("Native iOS package verification: \(cases.count) interoperability and rejection cases passed")
    }
}
