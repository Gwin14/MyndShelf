import ExpoModulesCore
import FileProvider

/// O app entrega endereço e token à extensão (targets/drive) pela pasta do App Group
/// e registra o domínio que aparece no app Arquivos.
public class MyndShelfDriveModule: Module {
  static let group = "group.app.myndshelf"
  static let domain = NSFileProviderDomain(identifier: NSFileProviderDomainIdentifier("myndshelf"), displayName: "MyndShelf")

  static var configURL: URL? {
    FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group)?.appendingPathComponent("drive.json")
  }

  public func definition() -> ModuleDefinition {
    Name("MyndShelfDrive")

    AsyncFunction("enable") { (url: String, token: String) in
      guard let file = Self.configURL else { throw Exception(name: "NoAppGroup", description: "App Group indisponível") }
      let data = try JSONSerialization.data(withJSONObject: ["url": url, "token": token])
      try data.write(to: file, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
      try await NSFileProviderManager.add(Self.domain)
      try? await NSFileProviderManager(for: Self.domain)?.signalEnumerator(for: .workingSet)
    }

    AsyncFunction("disable") {
      if let file = Self.configURL { try? FileManager.default.removeItem(at: file) }
      try? await NSFileProviderManager.remove(Self.domain)
    }

    AsyncFunction("refresh") {
      try? await NSFileProviderManager(for: Self.domain)?.signalEnumerator(for: .workingSet)
    }
  }
}
