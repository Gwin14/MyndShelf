/** Drive: a Estante no app Arquivos do iOS/iPadOS (File Provider).
 *  Os mesmos .swift viram a extensão do Finder no macOS (apps/desktop/scripts/build-drive-appex.mjs). */
/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = (config) => ({
  type: "file-provider",
  name: "MyndShelfDrive",
  displayName: "MyndShelf",
  icon: "../../assets/icon.png",
  deploymentTarget: "17.0",
  frameworks: ["FileProvider", "UniformTypeIdentifiers"],
  entitlements: {
    // o app deixa endereço e token em drive.json nesta pasta compartilhada
    "com.apple.security.application-groups": config.ios.entitlements["com.apple.security.application-groups"],
  },
});
