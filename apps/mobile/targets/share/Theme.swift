import SwiftUI
import CoreText

/// As mesmas cores e fontes do app (packages/design-tokens).
enum Theme {
  static let void = Color(red: 6 / 255, green: 5 / 255, blue: 11 / 255)
  static let night = Color(red: 12 / 255, green: 10 / 255, blue: 21 / 255)
  static let nebula = Color(red: 21 / 255, green: 18 / 255, blue: 41 / 255)
  static let paper = Color(red: 239 / 255, green: 230 / 255, blue: 210 / 255)
  static let paperDim = Color(red: 188 / 255, green: 179 / 255, blue: 161 / 255)
  static let paperMute = Color(red: 122 / 255, green: 116 / 255, blue: 104 / 255)
  static let line = Color(red: 239 / 255, green: 230 / 255, blue: 210 / 255).opacity(0.12)
  static let lineStrong = Color(red: 239 / 255, green: 230 / 255, blue: 210 / 255).opacity(0.24)
  static let cobalt = Color(red: 42 / 255, green: 75 / 255, blue: 1)
  static let cyan = Color(red: 111 / 255, green: 214 / 255, blue: 1)
  static let sun = Color(red: 1, green: 241 / 255, blue: 184 / 255)
  static let amber = Color(red: 1, green: 180 / 255, blue: 61 / 255)
  static let ember = Color(red: 1, green: 90 / 255, blue: 36 / 255)
  static let magenta = Color(red: 212 / 255, green: 42 / 255, blue: 106 / 255)

  /// A labareda solar das referências.
  static let flare = LinearGradient(
    stops: [
      .init(color: cobalt, location: 0), .init(color: cyan, location: 0.18), .init(color: sun, location: 0.38),
      .init(color: amber, location: 0.55), .init(color: ember, location: 0.74), .init(color: magenta, location: 1),
    ],
    startPoint: .leading, endPoint: .trailing)
  static let warm = LinearGradient(colors: [sun, amber, ember], startPoint: .leading, endPoint: .trailing)

  /// A curva do desktop (cubic-bezier(0.22, 1, 0.36, 1)): desacelera até parar, sem quicar.
  static func ease(_ duration: Double = 0.6) -> Animation { .timingCurve(0.22, 1, 0.36, 1, duration: duration) }

  static func registerFonts() {
    for name in ["InstrumentSerif_400Regular", "InstrumentSerif_400Regular_Italic", "SpaceMono_400Regular", "InterTight_500Medium", "InterTight_700Bold"] {
      if let url = Bundle.main.url(forResource: name, withExtension: "ttf") {
        CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil)
      }
    }
  }

  static func display(_ size: CGFloat, italic: Bool = false) -> Font {
    .custom(italic ? "InstrumentSerif-Italic" : "InstrumentSerif-Regular", size: size)
  }
  static func mono(_ size: CGFloat) -> Font { .custom("SpaceMono-Regular", size: size) }
  static func body(_ size: CGFloat, bold: Bool = false) -> Font { .custom(bold ? "InterTight-Bold" : "InterTight-Medium", size: size) }
}
