# apps/mobile — Expo / React Native

Cliente mobile do MyndShelf, mesma estética *Vintage Cosmic Dreamscape* do desktop, pensado para o polegar
(celular primeiro; o layout já abre em 3–5 colunas no tablet). Domínio compartilhado com o desktop via
`@myndshelf/core`; UI nativa própria.

- **Expo SDK 58 + expo-router** (`src/app`), só com módulos que já vêm no **Expo Go** — roda sem dev build.
- **Dados locais**: store do core sobre AsyncStorage; arquivos da Estante em `documentDirectory/creations/<id>`;
  chave do Gemini no SecureStore. Exportar/Importar em Ajustes troca o acervo em JSON com o desktop.
- **Sem CORS**: o app baixa as páginas direto (`src/lib/platform.ts`); o leitor usa linkedom + Readability.
- **Céu** em Skia, capas e objetos da Estante em Views/SVG, quadro infinito com Gesture Handler v3 + Reanimated.

| Tela | Onde |
|---|---|
| I · Captura (mural, filtros, transmissões, colar link, foto) | `src/app/(tabs)/index.tsx` |
| Detalhe, visualizador (player, leitor, imagem, mapa) | `src/app/capture/[id].tsx`, `src/app/view/[id].tsx` |
| Perguntar ao acervo · Sintonizar feed | `src/app/ask.tsx`, `src/app/feeds/add.tsx` |
| II · Estante (prateleiras, vitrine, galeria, leitura) | `src/app/(tabs)/shelf.tsx`, `src/app/creation/*` |
| III · Projetos (constelações, quadro, trazer itens) | `src/app/(tabs)/projects.tsx`, `src/app/project/*` |
| Ajustes (Gemini, backup) | `src/app/settings.tsx` |

Gestos: toque longo em qualquer card/objeto/nó abre as ações; no quadro, arraste o fundo para mover,
pince para aproximar, arraste um objeto para movê-lo e use *Ligar* para criar ligações.
Atalho: `myndshelf://save?url=…` (ou `?text=…`) guarda direto na Captura.

```bash
corepack pnpm mobile        # Metro + QR para o Expo Go no celular
corepack pnpm mobile:ios    # simulador iOS (precisa do Xcode selecionado)
```

Requer **Node 22.13+** (o Expo 58 avisa com Node 20). Opcional: `EXPO_PUBLIC_GEMINI_API_KEY` num `.env`.

Próximos passos: share extension / intents de compartilhar (pede dev build), MMKV, sincronização.
