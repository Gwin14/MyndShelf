import SwiftUI

/// O sheet de "guardado": sobe com a curva do desktop, a estrela acende, a prévia aparece
/// e ele se recolhe sozinho — a não ser que a pessoa comece a escrever uma nota.
struct ShareSheet: View {
  @ObservedObject var model: ShareModel
  @State private var shown = false
  @State private var spin = false
  @State private var countdown: CGFloat = 1
  @State private var autoClose = true
  @State private var closing = false
  @FocusState private var noteFocused: Bool

  private let wait = 2.8

  var body: some View {
    // o iOS apresenta a extensão num sheet próprio, de altura fixa: o conteúdo ocupa ele todo
    VStack(alignment: .leading, spacing: 20) {
      header
      preview
      noteField
      Spacer(minLength: 0)
      done
    }
    .padding(.horizontal, 24)
    .padding(.top, 34)
    .padding(.bottom, 16)
    .frame(maxWidth: 560, maxHeight: .infinity, alignment: .top)
    .frame(maxWidth: .infinity)
    .opacity(shown ? 1 : 0)
    .offset(y: shown ? 0 : 28)
    .background(sky.ignoresSafeArea())
    .overlay(alignment: .top) {
      // a labareda se esvazia enquanto o sheet espera para se recolher
      Capsule()
        .fill(Theme.flare)
        .frame(height: 2)
        .scaleEffect(x: model.state == .saved && autoClose ? countdown : (model.state == .saved ? 1 : 0), anchor: .leading)
        .padding(.horizontal, 40)
        .shadow(color: Theme.amber.opacity(0.8), radius: 6)
        .padding(.top, 16)
    }
    .contentShape(Rectangle())
    .onTapGesture {
      stopAutoClose()
      noteFocused = false
    }
    .onAppear {
      withAnimation(Theme.ease(0.6)) { shown = true }
      withAnimation(.linear(duration: 14).repeatForever(autoreverses: false)) { spin = true }
    }
    .onChange(of: model.state) { _, state in
      guard state == .saved else { return }
      withAnimation(.linear(duration: wait)) { countdown = 0 }
      DispatchQueue.main.asyncAfter(deadline: .now() + wait) {
        if autoClose && !noteFocused && model.note.isEmpty { dismiss() }
      }
    }
    .onChange(of: noteFocused) { _, focused in
      if focused { stopAutoClose() }
    }
  }

  /// Céu do app: noite, nebulosa fria no alto, brasa no pé e algumas faíscas.
  private var sky: some View {
    ZStack {
      Theme.night
      RadialGradient(colors: [Theme.cobalt.opacity(0.26), .clear], center: .topLeading, startRadius: 0, endRadius: 460)
      RadialGradient(colors: [Theme.ember.opacity(0.12), .clear], center: .bottomTrailing, startRadius: 0, endRadius: 420)
      GeometryReader { geo in
        ForEach(Array(Self.sparkles.enumerated()), id: \.offset) { _, s in
          Text("✦")
            .font(.system(size: s.size))
            .foregroundStyle(Theme.paper.opacity(s.alpha))
            .position(x: geo.size.width * s.x, y: geo.size.height * s.y)
        }
      }
    }
  }

  private static let sparkles: [(x: CGFloat, y: CGFloat, size: CGFloat, alpha: Double)] = [
    (0.86, 0.07, 11, 0.5), (0.12, 0.42, 7, 0.35), (0.78, 0.55, 8, 0.3), (0.32, 0.78, 6, 0.3), (0.92, 0.86, 9, 0.35),
  ]

  private var header: some View {
    HStack(alignment: .center, spacing: 12) {
      Text("✦")
        .font(.system(size: 22))
        .foregroundStyle(Theme.flare)
        .rotationEffect(.degrees(spin ? 360 : 0))
        .scaleEffect(model.state == .saved ? 1 : 0.6)
        .animation(Theme.ease(0.6), value: model.state)
      VStack(alignment: .leading, spacing: 2) {
        Text(kicker)
          .font(Theme.mono(9.5))
          .tracking(1.6)
          .textCase(.uppercase)
          .foregroundStyle(model.state == .failed ? Theme.ember : Theme.paperMute)
          .contentTransition(.opacity)
        HStack(spacing: 6) {
          Text(model.state == .failed ? "Nada para" : "Guardado na")
            .font(Theme.display(28))
            .foregroundStyle(Theme.paper)
          Text(model.state == .failed ? "guardar." : "Captura.")
            .font(Theme.display(28, italic: true))
            .foregroundStyle(Theme.warm)
        }
      }
      Spacer(minLength: 0)
    }
    .animation(Theme.ease(0.4), value: model.state)
  }

  private var kicker: String {
    switch model.state {
    case .receiving: "recebendo sinal…"
    case .saved: "I — em órbita"
    case .failed: "sem sinal"
    }
  }

  @ViewBuilder private var preview: some View {
    if let p = model.preview {
      VStack(alignment: .leading, spacing: 0) {
        if let image = p.image, !p.isNote {
          Image(uiImage: image)
            .resizable()
            .scaledToFill()
            .frame(height: 190)
            .frame(maxWidth: .infinity)
            .clipped()
            .transition(.opacity)
        }
        row(p)
      }
      .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
      .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(Theme.paper.opacity(0.04)))
      .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(Theme.line, lineWidth: 1))
      .transition(.opacity.combined(with: .offset(y: 10)))
      .animation(Theme.ease(0.5), value: p.title)
      .animation(Theme.ease(0.5), value: p.image != nil)
    }
  }

  private func row(_ p: ShareModel.Preview) -> some View {
    HStack(spacing: 14) {
      // com imagem grande em cima, a miniatura sobraria
      if p.image == nil || p.isNote { thumb(p) }
      VStack(alignment: .leading, spacing: 5) {
        if let title = p.title {
          Text(title)
            .font(p.isNote ? Theme.display(19, italic: true) : Theme.display(20))
            .foregroundStyle(Theme.paper)
            .lineLimit(p.isNote ? 3 : 2)
            .transition(.opacity.combined(with: .offset(y: 4)))
        } else {
          // título ainda chegando
          RoundedRectangle(cornerRadius: 4).fill(Theme.line).frame(height: 14).frame(maxWidth: 180)
          RoundedRectangle(cornerRadius: 4).fill(Theme.line).frame(height: 14).frame(maxWidth: 120)
        }
        Text(p.host)
          .font(Theme.mono(9.5))
          .tracking(1)
          .textCase(.uppercase)
          .foregroundStyle(Theme.paperMute)
          .lineLimit(1)
      }
      Spacer(minLength: 0)
    }
    .padding(12)
  }

  @ViewBuilder private func thumb(_ p: ShareModel.Preview) -> some View {
    Group {
      if let image = p.image {
        Image(uiImage: image).resizable().scaledToFill().transition(.opacity)
      } else if p.isNote {
        // ficha de biblioteca
        ZStack(alignment: .top) {
          Theme.paper
          Rectangle().fill(Theme.magenta.opacity(0.45)).frame(height: 1).padding(.top, 14)
        }
      } else {
        Theme.flare.overlay(Text(String(p.host.prefix(1)).uppercased()).font(Theme.display(26, italic: true)).foregroundStyle(Theme.void.opacity(0.7)))
      }
    }
    .frame(width: 64, height: 64)
    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    .animation(Theme.ease(0.5), value: p.image != nil)
  }

  private var noteField: some View {
    TextField("", text: $model.note, prompt: Text("Por que isso te chamou atenção?").foregroundStyle(Theme.paperMute), axis: .vertical)
      .font(Theme.display(18, italic: true))
      .foregroundStyle(Theme.paper)
      .tint(Theme.amber)
      .lineLimit(3...8)
      .focused($noteFocused)
      .padding(.horizontal, 14)
      .padding(.vertical, 12)
      .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(Theme.void.opacity(0.6)))
      .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(noteFocused ? Theme.amber.opacity(0.5) : Theme.line, lineWidth: 1))
      .disabled(model.state == .failed)
  }

  private var done: some View {
    Button(action: dismiss) {
      Text(model.note.isEmpty ? "Pronto" : "Guardar nota")
        .font(Theme.body(16, bold: true))
        .foregroundStyle(Theme.void)
        .frame(maxWidth: .infinity)
        .frame(height: 50)
        .background(Capsule().fill(Theme.flare))
        .shadow(color: Theme.amber.opacity(0.45), radius: 14)
    }
    .buttonStyle(.plain)
  }

  private func stopAutoClose() {
    guard autoClose else { return }
    autoClose = false
    withAnimation(Theme.ease(0.3)) { countdown = 1 }
  }

  private func dismiss() {
    guard !closing else { return }
    closing = true
    noteFocused = false
    withAnimation(Theme.ease(0.4)) { shown = false }
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { model.finish() }
  }
}
