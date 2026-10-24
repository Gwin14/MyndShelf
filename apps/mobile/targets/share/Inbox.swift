import Foundation

/// Caixa de entrada compartilhada com o app (App Group): a extensão deixa um JSON por item,
/// o app lê `inbox/` ao abrir, guarda na Captura e apaga o arquivo.
enum Inbox {
  static let group = "group.com.myndshelf.app"

  static var folder: URL? {
    guard let root = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group) else { return nil }
    let dir = root.appendingPathComponent("inbox", isDirectory: true)
    try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    return dir
  }

  struct Item: Codable {
    var id: String
    /// "url", "text" ou "image"
    var kind: String
    var url: String?
    var text: String?
    /// nome do arquivo da imagem dentro de inbox/
    var image: String?
    var title: String?
    var note: String?
    var createdAt: Double
  }

  /// Grava (ou regrava, ao ganhar uma nota) o item. Escrita atômica: o app nunca lê um JSON pela metade.
  @discardableResult
  static func write(_ item: Item) -> Bool {
    guard let dir = folder, let data = try? JSONEncoder().encode(item) else { return false }
    return (try? data.write(to: dir.appendingPathComponent("\(item.id).json"), options: .atomic)) != nil
  }

  static func saveImage(_ data: Data, id: String) -> String? {
    guard let dir = folder else { return nil }
    let name = "\(id).jpg"
    return (try? data.write(to: dir.appendingPathComponent(name), options: .atomic)) != nil ? name : nil
  }
}
