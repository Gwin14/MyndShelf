# MyndShelf ✦

Um lugar pessoal para o que te atravessa, o que você cria e onde as duas coisas se encontram.
Estética *Vintage Cosmic Dreamscape*: céu granulado, labaredas solares, tipografia editorial.

## Seções (desktop)

| | Seção | O que faz |
|---|---|---|
| I | **Captura** | Clone do mymind. Cole links, solte imagens ou escreva notas. O core lê OpenGraph, detecta o tipo e gera uma capa temática: disco de vinil (música), livro (livro), TV de tubo (vídeo), película 35mm (filme), recorte de revista (leitura), terminal (código), cartão-postal (lugar), ficha de biblioteca (nota)… |
| II | **Estante** | Suas criações como objetos físicos — contra as “não-coisas”. Imagem → quadro, documento → livro, áudio → fita cassete, vídeo → VHS, texto → manuscrito, outros → redoma. Estantes nomeadas, vitrine com destaque e galeria com etiquetas de museu. |
| III | **Projetos** | Moodboards num quadro infinito: arraste itens da Captura e da Estante, crie notas, ligue itens arrastando o ✦ da borda. Pan com arrastar/roda, zoom com ⌘+roda ou pinça. |

Atalhos: `⌘1` `⌘2` `⌘3` trocam de seção · `⌘V` em qualquer lugar da Captura guarda o que está na área de transferência · `Delete` remove o nó/ligação selecionado no quadro.

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
- Busca semântica / etiquetas automáticas
- Sincronização (packages/sync) para web e mobile
