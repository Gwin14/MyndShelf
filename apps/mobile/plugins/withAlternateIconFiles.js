// Ícones alternativos no formato do Icon Composer (.icon) para o iOS.
// O expo-alternate-app-icons só sabe gerar .appiconset a partir de PNG; aqui os
// .icon vão direto para o projeto (como o Expo faz com o `ios.icon`) e o Xcode 26
// compila tudo no Assets.car. O Android continua com os PNGs do plugin da lib.
const fs = require("fs");
const path = require("path");
const { IOSConfig, withDangerousMod, withXcodeProject } = require("expo/config-plugins");

const ALTERNATES = "ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES";

/** @param {string[]} icons caminhos dos .icon, relativos à raiz do app */
module.exports = function withAlternateIconFiles(config, icons = []) {
  config = withDangerousMod(config, [
    "ios",
    async (config) => {
      const { projectRoot, platformProjectRoot, projectName } = config.modRequest;
      for (const icon of icons) {
        const target = path.join(platformProjectRoot, projectName, path.basename(icon));
        await fs.promises.rm(target, { recursive: true, force: true });
        await fs.promises.cp(path.join(projectRoot, icon), target, { recursive: true });
      }
      return config;
    },
  ]);

  return withXcodeProject(config, (config) => {
    const project = config.modResults;
    const { projectName } = config.modRequest;
    const names = icons.map((icon) => path.basename(icon, ".icon"));

    for (const icon of icons) {
      const filepath = `${projectName}/${path.basename(icon)}`;
      if (project.hasFile(filepath)) continue;
      IOSConfig.XcodeUtils.addResourceFileToGroup({ filepath, groupName: projectName, project, isBuildFile: true });
    }

    // A lib grava a lista de alternativos em todos os alvos; só o app tem esses ícones,
    // a extensão de compartilhar quebraria procurando por eles.
    const [, app] = IOSConfig.Target.findNativeTargetByName(project, projectName);
    const appConfigs = new Set(project.pbxXCConfigurationList()[app.buildConfigurationList].buildConfigurations.map((c) => c.value));
    for (const [id, build] of Object.entries(project.pbxXCBuildConfigurationSection())) {
      if (!build?.buildSettings) continue;
      if (appConfigs.has(id)) {
        build.buildSettings[ALTERNATES] = `"${names.join(" ")}"`;
        build.buildSettings.ASSETCATALOG_COMPILER_INCLUDE_ALL_APPICON_ASSETS = "YES";
      } else {
        delete build.buildSettings[ALTERNATES];
      }
    }
    return config;
  });
};
