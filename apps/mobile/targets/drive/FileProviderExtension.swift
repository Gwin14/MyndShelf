import FileProvider
import Foundation

/// A Estante do MyndShelf no Finder (macOS) e no app Arquivos (iOS/iPadOS).
/// Estantes são pastas; criações com original no servidor são arquivos.
/// O sistema guarda a réplica local; a extensão só conversa com o servidor.
final class FileProviderExtension: NSObject, NSFileProviderReplicatedExtension {
  let domain: NSFileProviderDomain

  required init(domain: NSFileProviderDomain) {
    self.domain = domain
    super.init()
  }

  func invalidate() {}

  /// Roda uma tarefa assíncrona e devolve o Progress que o sistema espera.
  private func run(_ body: @escaping () async -> Void) -> Progress {
    let p = Progress(totalUnitCount: 1)
    Task {
      await body()
      p.completedUnitCount = 1
    }
    return p
  }

  private func client() throws -> DriveClient {
    try DriveClient()
  }

  func item(for identifier: NSFileProviderItemIdentifier, request: NSFileProviderRequest,
            completionHandler: @escaping (NSFileProviderItem?, Error?) -> Void) -> Progress {
    if identifier == .rootContainer {
      completionHandler(FileProviderItem(), nil)
      return Progress(totalUnitCount: 0)
    }
    if identifier == .trashContainer || identifier == .workingSet {
      completionHandler(nil, NSFileProviderError(.noSuchItem))
      return Progress(totalUnitCount: 0)
    }
    return run {
      do {
        let item = try await self.client().item(identifier.rawValue)
        completionHandler(FileProviderItem(item), nil)
      } catch {
        completionHandler(nil, error)
      }
    }
  }

  func fetchContents(for itemIdentifier: NSFileProviderItemIdentifier, version requestedVersion: NSFileProviderItemVersion?,
                     request: NSFileProviderRequest,
                     completionHandler: @escaping (URL?, NSFileProviderItem?, Error?) -> Void) -> Progress {
    run {
      do {
        let c = try self.client()
        let id = DriveID.from(itemIdentifier)
        let item = try await c.item(id)
        let url = try await c.download(id)
        completionHandler(url, FileProviderItem(item), nil)
      } catch {
        completionHandler(nil, nil, error)
      }
    }
  }

  func createItem(basedOn itemTemplate: NSFileProviderItem, fields: NSFileProviderItemFields, contents url: URL?,
                  options: NSFileProviderCreateItemOptions = [], request: NSFileProviderRequest,
                  completionHandler: @escaping (NSFileProviderItem?, NSFileProviderItemFields, Bool, Error?) -> Void) -> Progress {
    let name = itemTemplate.filename
    if isTempName(name) {
      completionHandler(nil, [], false, NSFileProviderError(.excludedFromSync))
      return Progress(totalUnitCount: 0)
    }
    let parent = DriveID.from(itemTemplate.parentItemIdentifier)
    let type = itemTemplate.contentType ?? .data
    return run {
      do {
        let c = try self.client()
        if type.conforms(to: .folder) {
          // estantes não têm subpastas
          guard parent == DriveID.root else { throw NSFileProviderError(.cannotSynchronize) }
          completionHandler(FileProviderItem(try await c.mkdir(name)), [], false, nil)
          return
        }
        if type.conforms(to: .symbolicLink) || type.conforms(to: .aliasFile) {
          throw NSFileProviderError(.excludedFromSync)
        }
        guard let url else { throw NSFileProviderError(.cannotSynchronize) }
        let item = try await c.createFile(parent: parent, name: name, file: url)
        // o nome pode ter sido ajustado pelo servidor; o sistema aplica o que voltar
        completionHandler(FileProviderItem(item), [], false, nil)
      } catch {
        completionHandler(nil, [], false, error)
      }
    }
  }

  func modifyItem(_ item: NSFileProviderItem, baseVersion version: NSFileProviderItemVersion,
                  changedFields: NSFileProviderItemFields, contents newContents: URL?,
                  options: NSFileProviderModifyItemOptions = [], request: NSFileProviderRequest,
                  completionHandler: @escaping (NSFileProviderItem?, NSFileProviderItemFields, Bool, Error?) -> Void) -> Progress {
    let id = DriveID.from(item.itemIdentifier)
    return run {
      do {
        let c = try self.client()
        var current = try await c.item(id)
        if changedFields.contains(.contents), let newContents {
          current = try await c.replaceFile(id, name: item.filename, file: newContents)
        }
        let rename = changedFields.contains(.filename) && item.filename != current.name ? item.filename : nil
        let parent = DriveID.from(item.parentItemIdentifier)
        let move = changedFields.contains(.parentItemIdentifier) && parent != current.parentId ? parent : nil
        if rename != nil || move != nil {
          current = try await c.patch(id, name: rename, parent: move)
        }
        // campos que não guardamos (datas, etiquetas do Finder) ficam só na réplica
        completionHandler(FileProviderItem(current), [], false, nil)
      } catch {
        completionHandler(nil, [], false, error)
      }
    }
  }

  func deleteItem(identifier: NSFileProviderItemIdentifier, baseVersion version: NSFileProviderItemVersion,
                  options: NSFileProviderDeleteItemOptions = [], request: NSFileProviderRequest,
                  completionHandler: @escaping (Error?) -> Void) -> Progress {
    let id = DriveID.from(identifier)
    return run {
      do {
        let c = try self.client()
        // apagar uma pasta no Finder apaga o que está dentro (o servidor só devolveria à raiz)
        let all = try await c.list().items
        if all.first(where: { $0.id == id })?.isFolder == true {
          for child in all where child.parentId == id {
            try await c.delete(child.id)
          }
        }
        try await c.delete(id)
        completionHandler(nil)
      } catch let e as NSFileProviderError where e.code == .noSuchItem {
        completionHandler(nil)
      } catch {
        completionHandler(error)
      }
    }
  }

  func enumerator(for containerItemIdentifier: NSFileProviderItemIdentifier, request: NSFileProviderRequest) throws -> NSFileProviderEnumerator {
    if containerItemIdentifier == .trashContainer { throw NSFileProviderError(.noSuchItem) }
    return DriveEnumerator(container: containerItemIdentifier)
  }
}

/// Lista uma pasta (ou tudo, para o "working set") e conta o que mudou desde a âncora.
final class DriveEnumerator: NSObject, NSFileProviderEnumerator {
  let container: NSFileProviderItemIdentifier

  init(container: NSFileProviderItemIdentifier) {
    self.container = container
  }

  func invalidate() {}

  private func scope(_ items: [DriveItem]) -> [DriveItem] {
    if container == .workingSet { return items }
    let id = DriveID.from(container)
    return items.filter { $0.parentId == id }
  }

  private static func anchor(_ cursor: Int) -> NSFileProviderSyncAnchor {
    NSFileProviderSyncAnchor(Data(String(cursor).utf8))
  }

  func enumerateItems(for observer: NSFileProviderEnumerationObserver, startingAt page: NSFileProviderPage) {
    Task {
      do {
        let list = try await DriveClient().list()
        observer.didEnumerate(self.scope(list.items).map(FileProviderItem.init))
        observer.finishEnumerating(upTo: nil)
      } catch {
        observer.finishEnumeratingWithError(error)
      }
    }
  }

  func enumerateChanges(for observer: NSFileProviderChangeObserver, from anchor: NSFileProviderSyncAnchor) {
    Task {
      guard let since = Int(String(decoding: anchor.rawValue, as: UTF8.self)) else {
        observer.finishEnumeratingWithError(NSFileProviderError(.syncAnchorExpired))
        return
      }
      do {
        let ch = try await DriveClient().changes(since: since)
        if ch.full == true {
          let live = ch.items.filter { $0.deleted != true }
          observer.didUpdate(self.scope(live).map(FileProviderItem.init))
          let gone = ch.items.filter { $0.deleted == true }.map { DriveID.to($0.id) }
          if !gone.isEmpty { observer.didDeleteItems(withIdentifiers: gone) }
        }
        observer.finishEnumeratingChanges(upTo: Self.anchor(ch.cursor), moreComing: false)
      } catch {
        observer.finishEnumeratingWithError(error)
      }
    }
  }

  func currentSyncAnchor(completionHandler: @escaping (NSFileProviderSyncAnchor?) -> Void) {
    Task {
      // sem nada novo depois do fim, /changes só devolve o cursor atual
      let ch = try? await DriveClient().changes(since: Int(Int32.max))
      completionHandler(ch.map { Self.anchor($0.cursor) })
    }
  }
}
