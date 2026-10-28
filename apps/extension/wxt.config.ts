import { defineConfig, type UserConfig } from "wxt";

// Uma base só para Chrome, Edge, Firefox, Safari (e os outros Chromium: Brave, Arc, Opera…).
export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  // os auto-imports confundem o parâmetro `storage` de packages/core com o do WXT;
  // os pacotes do monorepo ficam de fora (aqui os imports vêm explícitos de "#imports")
  // (`exclude` vai direto ao plugin do unimport, que o tipo do WXT não lista)
  imports: { exclude: [/[\\/]node_modules[\\/]/, /[\\/]packages[\\/]/] } as UserConfig["imports"],
  // MV3 em todos, inclusive no Firefox (o padrão do WXT lá ainda é MV2)
  manifestVersion: 3,
  manifest: ({ browser }) => ({
    name: "MyndShelf — Captura",
    short_name: "MyndShelf",
    description: "Guarde o link, a imagem ou o trecho aberto na Captura do MyndShelf, direto no seu servidor.",
    permissions: ["storage", "activeTab", "scripting", "contextMenus", "alarms"],
    // só o endereço do servidor, pedido ao conectar
    optional_host_permissions: ["https://*/*", "http://*/*"],
    action: { default_title: "Guardar no MyndShelf" },
    commands: {
      _execute_action: {
        suggested_key: { default: "Alt+Shift+M" },
        description: "Abrir a captura",
      },
      "capture-tab": {
        suggested_key: { default: "Alt+Shift+S" },
        description: "Guardar a aba atual sem abrir nada",
      },
    },
    ...(browser === "firefox" && {
      browser_specific_settings: {
        gecko: {
          id: "extension@myndshelf.app",
          strict_min_version: "140.0",
          // o que sai do navegador vai só para o servidor do próprio usuário, e só quando ele pede
          data_collection_permissions: { required: ["browsingActivity", "websiteContent"] },
        },
      },
    }),
  }),
});
