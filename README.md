# MyndShelf ✦

Um lugar pessoal para o que te atravessa, o que você cria e onde as duas coisas se encontram.
Estética *Vintage Cosmic Dreamscape*: céu granulado, labaredas solares, tipografia editorial.

## Seções (desktop)

| | Seção | O que faz |
|---|---|---|
| I | **Captura** | Clone do mymind. Cole links, solte imagens ou escreva notas. O core lê OpenGraph, detecta o tipo e gera uma capa temática: disco de vinil (música), livro (livro), TV de tubo (vídeo), película 35mm (filme), recorte de revista (leitura), terminal (código), cartão-postal (lugar), ficha de biblioteca (nota)… Lugares: links de qualquer mapa (Google, Apple, OSM, Waze, Bing, Yandex, links curtos de compartilhar, `geo:`) ou coordenadas coladas viram cartões-postais com mapa. Itens com conteúdo abrem dentro do app (player de vídeo/música, leitor de artigos). **Transmissões**: siga feeds RSS/Atom (blogs, revistas, canais do YouTube, podcasts) — cole qualquer link — site, canal do YouTube, subreddit, repo do GitHub, perfil do Bluesky/Mastodon/Letterboxd, podcast da Apple, SoundCloud… — e o feed é encontrado sozinho (regras em `packages/core/src/feedResolve.ts`); as novidades aparecem por dia e podem ser lidas, tocadas ou guardadas como captura. |
| II | **Estante** | Suas criações como objetos físicos — contra as “não-coisas”. Imagem → quadro, documento → livro, áudio → fita cassete, vídeo → VHS, texto → manuscrito, outros → redoma. Estantes nomeadas, vitrine com destaque e galeria com etiquetas de museu. |
| III | **Projetos** | Moodboards num quadro infinito: arraste itens da Captura e da Estante, crie notas, ligue itens arrastando o ✦ da borda. Pan com arrastar/roda, zoom com ⌘+roda ou pinça. |

**Gemini** (opcional, chave em Ajustes — `⌘,` — ou `VITE_GEMINI_API_KEY` num `.env`): trabalha de apoio, sem campos próprios. Capturas novas ganham etiquetas ao serem guardadas. No detalhe, "✦ sugerir" completa as etiquetas e *Resumir* mostra um resumo que some ao fechar o item (nada é guardado). Documentos da Estante têm *Analisar* no visualizador. O campo grande da Captura faz tudo: digitar filtra o mural, `⇥` pergunta ao acervo inteiro (com os itens citados clicáveis) e `⇧↵` guarda como nota ou link. Usa o Flash-Lite, pela velocidade, e o Flash como reserva. Prompts e cliente em `packages/core/src/ai.ts`.

Atalhos: `⌘1` `⌘2` `⌘3` trocam de seção · `⌘,` ajustes · `⌘V` em qualquer lugar da Captura guarda o que está na área de transferência · `Delete` remove o nó/ligação selecionado no quadro.

## Estrutura

```
apps/
  desktop/          Vite + React + Tauri 2   ← em desenvolvimento
    src/            interface (features/capture, shelf, projects)
    src-tauri/      Rust: comando fetch_html (OpenGraph sem CORS), janela, opener
  web/              Next.js (futuro) — por ora o site é o build do desktop servido pelo servidor
  mobile/           Expo 58 + expo-router (React Native)  ← em desenvolvimento
  server/           self-hosted: Hono + SQLite (node:sqlite, FTS5), arquivos em disco, Docker + Tailscale
packages/
  types/            modelos de dados compartilhados
  sync/             sincronização: contrato da API, fila de envio, "mudanças desde X", último a editar vence
  core/             regras de negócio: parser OpenGraph, detecção de tipo, store (zustand) com storage injetável
  design-tokens/    cores, fontes, ritmo — TS + CSS vars
  config/           tsconfig base
```

A UI é por plataforma; o domínio é compartilhado. O store do core recebe um `StateStorage`
(IndexedDB no desktop; MMKV/AsyncStorage no mobile) e um `HtmlFetcher` (Rust no desktop, servidor na web).

## Rodando

Pré-requisitos: Node 20+, Rust, `corepack` (vem com o Node).

```bash
corepack pnpm install
corepack pnpm desktop        # app Tauri com hot reload
corepack pnpm desktop:web    # só a interface no navegador (http://localhost:1420)
corepack pnpm desktop:build  # gera o .app / .dmg
corepack pnpm mobile         # app mobile no Expo Go (Node 22.13+)
```

**Sincronização (self-hosted)**: Ajustes → Servidor liga o app a um servidor seu, acessado pelo Tailscale. O app continua lendo e escrevendo só no banco local, então funciona igual sem conexão; cada mudança entra numa fila que sobe quando o servidor responde, e depois o app busca o que mudou nos outros aparelhos. Os originais da Estante descem ao abrir (ou todos, com *Manter arquivos offline*). Instalação no homelab: [`apps/server/README.md`](apps/server/README.md).

**Drive** (precisa do servidor): a Estante aparece no gerenciador de arquivos de cada sistema, como Google Drive e Proton Drive. Cada estante vira uma pasta, e os arquivos baixam quando você abre. O que você solta, edita, renomeia, move ou apaga ali vale para o acervo. Estantes não têm subpastas.

| Sistema | Onde aparece | Como liga | Código |
|---|---|---|---|
| macOS | Finder → Locais → MyndShelf | Ajustes → Servidor → *Mostrar a Estante no Finder* | extensão File Provider (`apps/mobile/targets/drive/*.swift`, montada por `apps/desktop/scripts/build-drive-appex.mjs`) + registro em `src-tauri/drive/src/macos.rs` |
| Windows | Explorer → painel lateral → MyndShelf (`%USERPROFILE%\MyndShelf`) | o mesmo interruptor | Cloud Files API, `src-tauri/drive/src/windows.rs` |
| Linux | `~/MyndShelf` + atalho no Nautilus/Dolphin/Thunar | o mesmo interruptor (precisa do pacote `fuse3`) | FUSE, `src-tauri/drive/src/linux.rs` |
| iOS/iPadOS | app Arquivos → Locais → MyndShelf | sozinho, ao conectar ao servidor | target `apps/mobile/targets/drive` + `modules/myndshelf-drive/ios` |
| Android | app Arquivos / seletor de documentos → MyndShelf | sozinho, ao conectar ao servidor | `modules/myndshelf-drive/android` (DocumentsProvider) |

No Windows e no Linux, o drive roda dentro do app (como o Google Drive): o app precisa estar aberto, nem que seja só na bandeja. No macOS, iOS e Android, quem cuida é o sistema. A API do servidor está em `apps/server/README.md` → *Drive*.

Para gerar o app do macOS com o drive:

```bash
MYNDSHELF_APPLE_TEAM_ID=<seu Team ID> \
APPLE_SIGNING_IDENTITY="Developer ID Application: …" \
MYNDSHELF_APP_PROFILE=<app>.provisionprofile \
MYNDSHELF_DRIVE_PROFILE=<extensão>.provisionprofile \
corepack pnpm desktop:build
```

Sem Team ID o app funciona, mas o macOS não carrega a extensão (App Group exige assinatura). Sem os provisioning profiles, o macOS 15+ não libera a pasta do App Group e o interruptor responde "Operation not permitted". Crie em developer.apple.com dois App IDs com a capability App Groups (`app.myndshelf.desktop` e `app.myndshelf.desktop.drive`) e um profile de macOS para cada um (*Development* para este Mac, *Developer ID* para distribuir). O build confere se cada profile é do bundle certo e tem o grupo `<Team ID>.app.myndshelf.desktop`. No iOS, o target precisa do mesmo App Group (`group.app.myndshelf`) no seu time: `npx expo prebuild` + `expo run:ios`.

Testar o drive do Linux sem o app: `cd apps/desktop/src-tauri/drive && cargo run --example mount -- <url> <token> <pasta>` monta em `<pasta>/MyndShelf`.

Backup: Ajustes → Acervo exporta/importa o acervo em JSON, no desktop e no celular (mesmo formato, `packages/core/src/backup.ts`).

## Próximos passos sugeridos

- Copiar arquivos da Estante para a pasta do app (hoje ficam como blobs no IndexedDB)
- Extração de cor dominante das capas para tingir cards e quadro
- Busca semântica
- Fila de IA offline: etiquetar capturas guardadas sem conexão quando o servidor voltar
