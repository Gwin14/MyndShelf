import FileProvider
import Foundation
import UniformTypeIdentifiers

/// Endereço e token do servidor, deixados pelo app na pasta do App Group (`drive.json`).
/// Este arquivo é compartilhado pela extensão do iOS (app Arquivos) e do macOS (Finder).
struct DriveConfig: Codable {
  var url: String
  var token: String

  static var group: String {
    Bundle.main.object(forInfoDictionaryKey: "MyndShelfAppGroup") as? String ?? "group.app.myndshelf"
  }

  static func load() -> DriveConfig? {
    guard let dir = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group),
          let data = try? Data(contentsOf: dir.appendingPathComponent("drive.json"))
    else { return nil }
    return try? JSONDecoder().decode(DriveConfig.self, from: data)
  }
}

/// Um item do drive (contrato em packages/sync/src/protocol.ts).
struct DriveItem: Codable {
  var id: String
  var parentId: String
  var kind: String
  var name: String
  var size: Int64?
  var mime: String?
  var createdAt: Double?
  var version: String
  var contentVersion: Int?
  var deleted: Bool?

  var isFolder: Bool { kind == "folder" }
}

struct DriveList: Codable {
  var items: [DriveItem]
  var cursor: Int
}

struct DriveChanges: Codable {
  var items: [DriveItem]
  var cursor: Int
  var full: Bool?
}

enum DriveID {
  static let root = "root"

  static func from(_ id: NSFileProviderItemIdentifier) -> String {
    id == .rootContainer ? root : id.rawValue
  }

  static func to(_ id: String) -> NSFileProviderItemIdentifier {
    id == root ? .rootContainer : NSFileProviderItemIdentifier(id)
  }
}

/// Cliente de /api/drive/*.
final class DriveClient {
  let base: URL
  let token: String
  let session: URLSession

  init() throws {
    guard let cfg = DriveConfig.load(), let url = URL(string: cfg.url) else {
      throw NSFileProviderError(.notAuthenticated)
    }
    base = url
    token = cfg.token
    let conf = URLSessionConfiguration.default
    conf.timeoutIntervalForRequest = 60
    conf.waitsForConnectivity = false
    session = URLSession(configuration: conf)
  }

  private func request(_ method: String, _ path: String, query: [URLQueryItem] = []) -> URLRequest {
    var comps = URLComponents(url: base.appendingPathComponent(path), resolvingAgainstBaseURL: false)!
    if !query.isEmpty { comps.queryItems = query }
    var r = URLRequest(url: comps.url!)
    r.httpMethod = method
    r.setValue("Bearer \(token)", forHTTPHeaderField: "authorization")
    return r
  }

  private func check(_ response: URLResponse) throws {
    guard let http = response as? HTTPURLResponse else { throw NSFileProviderError(.serverUnreachable) }
    switch http.statusCode {
    case 200..<300: return
    case 401: throw NSFileProviderError(.notAuthenticated)
    case 404: throw NSFileProviderError(.noSuchItem)
    case 422: throw NSFileProviderError(.cannotSynchronize)
    default: throw NSFileProviderError(.serverUnreachable)
    }
  }

  private func send<T: Decodable>(_ r: URLRequest, body: Data? = nil) async throws -> T {
    do {
      let (data, res): (Data, URLResponse)
      if let body {
        (data, res) = try await session.upload(for: r, from: body)
      } else {
        (data, res) = try await session.data(for: r)
      }
      try check(res)
      return try JSONDecoder().decode(T.self, from: data)
    } catch let e as NSFileProviderError {
      throw e
    } catch is DecodingError {
      throw NSFileProviderError(.cannotSynchronize)
    } catch {
      throw NSFileProviderError(.serverUnreachable)
    }
  }

  private func sendFile<T: Decodable>(_ r: URLRequest, file: URL) async throws -> T {
    do {
      let (data, res) = try await session.upload(for: r, fromFile: file)
      try check(res)
      return try JSONDecoder().decode(T.self, from: data)
    } catch let e as NSFileProviderError {
      throw e
    } catch {
      throw NSFileProviderError(.serverUnreachable)
    }
  }

  func list() async throws -> DriveList {
    try await send(request("GET", "api/drive/items"))
  }

  func item(_ id: String) async throws -> DriveItem {
    try await send(request("GET", "api/drive/items/\(id)"))
  }

  func changes(since: Int) async throws -> DriveChanges {
    try await send(request("GET", "api/drive/changes", query: [URLQueryItem(name: "since", value: String(since))]))
  }

  /// Baixa para um arquivo temporário (a extensão entrega ao sistema, que move).
  func download(_ id: String) async throws -> URL {
    do {
      let (tmp, res) = try await session.download(for: request("GET", "api/files/\(id)"))
      try check(res)
      let dest = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
      try FileManager.default.moveItem(at: tmp, to: dest)
      return dest
    } catch let e as NSFileProviderError {
      throw e
    } catch {
      throw NSFileProviderError(.serverUnreachable)
    }
  }

  private static func mime(_ name: String) -> String {
    UTType(filenameExtension: (name as NSString).pathExtension)?.preferredMIMEType ?? "application/octet-stream"
  }

  func createFile(parent: String, name: String, file: URL) async throws -> DriveItem {
    var r = request("POST", "api/drive/files", query: [URLQueryItem(name: "parent", value: parent)])
    r.setValue(name.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? "arquivo", forHTTPHeaderField: "x-file-name")
    r.setValue(Self.mime(name), forHTTPHeaderField: "content-type")
    return try await sendFile(r, file: file)
  }

  func replaceFile(_ id: String, name: String, file: URL) async throws -> DriveItem {
    var r = request("PUT", "api/drive/files/\(id)")
    r.setValue(Self.mime(name), forHTTPHeaderField: "content-type")
    return try await sendFile(r, file: file)
  }

  func mkdir(_ name: String) async throws -> DriveItem {
    var r = request("POST", "api/drive/folders")
    r.setValue("application/json", forHTTPHeaderField: "content-type")
    return try await send(r, body: try JSONEncoder().encode(["name": name]))
  }

  func patch(_ id: String, name: String?, parent: String?) async throws -> DriveItem {
    var r = request("PATCH", "api/drive/items/\(id)")
    r.setValue("application/json", forHTTPHeaderField: "content-type")
    var body: [String: String] = [:]
    if let name { body["name"] = name }
    if let parent { body["parentId"] = parent }
    return try await send(r, body: try JSONEncoder().encode(body))
  }

  func delete(_ id: String) async throws {
    struct Ok: Decodable {}
    let _: Ok = try await send(request("DELETE", "api/drive/items/\(id)"))
  }
}

/// Arquivos temporários de editores e do sistema: não sobem.
func isTempName(_ name: String) -> Bool {
  let n = name.lowercased()
  return n.hasPrefix(".") || n.hasPrefix("~$") || n.hasSuffix("~") || n.hasSuffix(".tmp") || n.hasSuffix(".swp")
    || n.hasSuffix(".part") || n.hasSuffix(".crdownload") || n == "desktop.ini" || n == "thumbs.db"
}
