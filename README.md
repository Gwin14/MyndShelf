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
  web/              Next.js (futuro)
  mobile/           Expo / React Native (futuro)
packages/
  types/            modelos de dados compartilhados
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
```

## Próximos passos sugeridos

- Copiar arquivos da Estante para a pasta do app (hoje ficam como blobs no IndexedDB)
- Extração de cor dominante das capas para tingir cards e quadro
- Busca semântica
- Sincronização (packages/sync) para web e mobile
