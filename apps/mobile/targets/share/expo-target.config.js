/** Extensão de compartilhamento: "Guardar no MyndShelf" no menu de compartilhar do iOS. */
/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = (config) => ({
  type: "share",
  name: "MyndShelfShare",
  displayName: "MyndShelf",
  icon: "../../assets/icon.png",
  deploymentTarget: "17.0",
  frameworks: ["SwiftUI", "LinkPresentation", "UniformTypeIdentifiers", "CoreText"],
  entitlements: {
    // a mesma pasta compartilhada do app: a extensão deixa o item, o app importa
    "com.apple.security.application-groups": config.ios.entitlements["com.apple.security.application-groups"],
  },
});
