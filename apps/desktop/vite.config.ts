import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Só em `vite dev` no navegador: proxy de HTML para ler OpenGraph sem CORS.
 * Dentro do Tauri quem faz isso é o comando Rust `fetch_html`.
 */
function devOgProxy(): Plugin {
  return {
    name: "myndshelf-og-proxy",
    configureServer(server) {
      server.middlewares.use("/__og", async (req, res) => {
        const target = new URL(req.url ?? "", "http://x").searchParams.get("url");
        if (!target || !/^https?:\/\//.test(target)) {
          res.statusCode = 400;
          return res.end();
        }
        try {
          const r = await fetch(target, {
            headers: { "user-agent": "Mozilla/5.0 (compatible; MyndShelfBot/0.1; link preview)", "accept-language": "pt-BR,pt;q=0.9,en;q=0.8" },
            redirect: "follow",
          });
          res.setHeader("content-type", "text/plain; charset=utf-8");
          res.end((await r.text()).slice(0, 2_500_000));
        } catch {
          res.statusCode = 502;
          res.end();
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), devOgProxy()],
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  envPrefix: ["VITE_", "TAURI_ENV_"],
  build: { target: "safari15", outDir: "dist" },
});
