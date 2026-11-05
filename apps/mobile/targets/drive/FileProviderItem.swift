import FileProvider
import UniformTypeIdentifiers

/// Um item do drive como o Finder / app Arquivos o enxergam.
final class FileProviderItem: NSObject, NSFileProviderItem {
  let item: DriveItem?

  /// a raiz ("MyndShelf")
  override init() {
    item = nil
  }

  init(_ item: DriveItem) {
    self.item = item
  }

  var itemIdentifier: NSFileProviderItemIdentifier {
    item.map { DriveID.to($0.id) } ?? .rootContainer
  }

  var parentItemIdentifier: NSFileProviderItemIdentifier {
    item.map { DriveID.to($0.parentId) } ?? .rootContainer
  }

  var filename: String {
    item?.name ?? "MyndShelf"
  }

  var contentType: UTType {
    guard let item else { return .folder }
    if item.isFolder { return .folder }
    let ext = (item.name as NSString).pathExtension
    return UTType(filenameExtension: ext) ?? item.mime.flatMap { UTType(mimeType: $0) } ?? .data
  }

  var documentSize: NSNumber? {
    item?.size.map { NSNumber(value: $0) }
  }

  var creationDate: Date? {
    item?.createdAt.map { Date(timeIntervalSince1970: $0 / 1000) }
  }

  var contentModificationDate: Date? {
    creationDate
  }

  var capabilities: NSFileProviderItemCapabilities {
    guard let item else { return [.allowsContentEnumerating, .allowsAddingSubItems, .allowsReading] }
    if item.isFolder {
      // estantes: só uma camada, mas aceitam arquivos
      return [.allowsContentEnumerating, .allowsReading, .allowsAddingSubItems, .allowsRenaming, .allowsDeleting]
    }
    return [.allowsReading, .allowsWriting, .allowsRenaming, .allowsReparenting, .allowsDeleting]
  }

  var itemVersion: NSFileProviderItemVersion {
    let content = Data(String(item?.contentVersion ?? 0).utf8)
    let meta = Data((item?.version ?? "root").utf8)
    return NSFileProviderItemVersion(contentVersion: content, metadataVersion: meta)
  }
}
