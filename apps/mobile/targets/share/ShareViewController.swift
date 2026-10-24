import LinkPresentation
import SwiftUI
import UIKit
import UniformTypeIdentifiers

/// "MyndShelf" no menu de compartilhar: guarda na hora e mostra o sheet animado.
final class ShareViewController: UIViewController {
  private let model = ShareModel()

  override func viewDidLoad() {
    super.viewDidLoad()
    Theme.registerFonts()
    view.backgroundColor = .clear

    model.onClose = { [weak self] in self?.close() }
    let host = UIHostingController(rootView: ShareSheet(model: model))
    host.view.backgroundColor = .clear
    addChild(host)
    host.view.frame = view.bounds
    host.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    view.addSubview(host.view)
    host.didMove(toParent: self)

    Task { await receive() }
  }

  private func close() {
    extensionContext?.completeRequest(returningItems: nil)
  }

  /// Lê o que veio do outro app: link, texto ou imagens. O primeiro que servir vence.
  @MainActor
  private func receive() async {
    let providers = (extensionContext?.inputItems as? [NSExtensionItem] ?? []).flatMap { $0.attachments ?? [] }

    // 1. link (Safari, YouTube, Spotify…)
    for p in providers where p.hasItemConformingToTypeIdentifier(UTType.url.identifier) {
      if let url = try? await p.loadItem(forTypeIdentifier: UTType.url.identifier) as? URL, !url.isFileURL {
        return save(url: url)
      }
    }
    // 2. imagens (Fotos, capturas de tela)
    var images: [Data] = []
    for p in providers where p.hasItemConformingToTypeIdentifier(UTType.image.identifier) {
      if let data = await imageData(p) { images.append(data) }
    }
    if !images.isEmpty { return save(images: images) }
    // 3. texto (pode conter um link)
    for p in providers where p.hasItemConformingToTypeIdentifier(UTType.plainText.identifier) {
      if let text = try? await p.loadItem(forTypeIdentifier: UTType.plainText.identifier) as? String, !text.isEmpty {
        if let url = firstLink(in: text) { return save(url: url, text: text) }
        return save(text: text)
      }
    }
    model.state = .failed
  }

  private func imageData(_ p: NSItemProvider) async -> Data? {
    guard let item = try? await p.loadItem(forTypeIdentifier: UTType.image.identifier) else { return nil }
    let image: UIImage? = switch item {
    case let url as URL: UIImage(contentsOfFile: url.path)
    case let data as Data: UIImage(data: data)
    case let img as UIImage: img
    default: nil
    }
    // o app reduz de novo; aqui só evita guardar fotos de 20 MB na caixa compartilhada
    return image.flatMap { $0.resized(maxSide: 2000).jpegData(compressionQuality: 0.88) }
  }

  private func firstLink(in text: String) -> URL? {
    let detector = try? NSDataDetector(types: NSTextCheckingResult.CheckingType.link.rawValue)
    let range = NSRange(text.startIndex..., in: text)
    let match = detector?.firstMatch(in: text, range: range)
    // só trata como link quando o texto é basicamente o link
    guard let m = match, let url = m.url, m.range.length > text.count / 2 else { return nil }
    return url
  }

  /* ── guardar ── */

  private func newItem(kind: String) -> Inbox.Item {
    Inbox.Item(id: UUID().uuidString, kind: kind, createdAt: Date().timeIntervalSince1970 * 1000)
  }

  private func save(url: URL, text: String? = nil) {
    var item = newItem(kind: "url")
    item.text = text
    item.url = url.absoluteString
    model.preview = .init(title: nil, host: url.host()?.replacingOccurrences(of: "www.", with: "") ?? url.absoluteString, image: nil)
    commit(item)
    // a prévia (título + imagem) vem do LinkPresentation, enquanto o sheet já mostra "guardado"
    let provider = LPMetadataProvider()
    provider.timeout = 8
    provider.startFetchingMetadata(for: url) { [weak self] meta, _ in
      guard let self, let meta else { return }
      let title = meta.title
      Task { @MainActor in
        self.model.preview?.title = title
        guard var current = self.model.item else { return }
        current.title = title
        self.model.item = current
        Inbox.write(current)
      }
      meta.imageProvider?.loadObject(ofClass: UIImage.self) { image, _ in
        guard let image = image as? UIImage else { return }
        Task { @MainActor in self.model.preview?.image = image }
      }
    }
  }

  private func save(text: String) {
    var item = newItem(kind: "text")
    item.text = text
    model.preview = .init(title: text, host: "nota", image: nil, isNote: true)
    commit(item)
  }

  private func save(images: [Data]) {
    var first: Inbox.Item?
    for data in images {
      var item = newItem(kind: "image")
      item.image = Inbox.saveImage(data, id: item.id)
      if first == nil { first = item; model.item = item }
      Inbox.write(item)
    }
    model.preview = .init(title: images.count > 1 ? "\(images.count) imagens" : "Imagem", host: "fotos", image: images.first.flatMap(UIImage.init(data:)))
    model.state = first?.image != nil ? .saved : .failed
  }

  private func commit(_ item: Inbox.Item) {
    model.item = item
    model.state = Inbox.write(item) ? .saved : .failed
  }
}

/// Estado do sheet; a nota digitada regrava o item antes de fechar.
@MainActor
final class ShareModel: ObservableObject {
  enum State { case receiving, saved, failed }
  struct Preview {
    var title: String?
    var host: String
    var image: UIImage?
    var isNote = false
  }

  @Published var state: State = .receiving
  @Published var preview: Preview?
  @Published var note = ""
  var item: Inbox.Item?
  var onClose: () -> Void = {}

  func finish() {
    if var item, !note.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
      item.note = note
      Inbox.write(item)
    }
    onClose()
  }
}

private extension UIImage {
  func resized(maxSide: CGFloat) -> UIImage {
    let scale = min(1, maxSide / max(size.width, size.height))
    guard scale < 1 else { return self }
    let target = CGSize(width: size.width * scale, height: size.height * scale)
    return UIGraphicsImageRenderer(size: target).image { _ in draw(in: CGRect(origin: .zero, size: target)) }
  }
}
