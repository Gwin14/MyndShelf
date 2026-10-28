# MyndShelf · extensão de navegador

O "compartilhar" do celular, no navegador: guarda a página aberta, um link, uma imagem ou um trecho selecionado na **Captura**, sem o app desktop aberto. Uma base só ([WXT](https://wxt.dev)) para Chrome, Edge, Brave/Arc/Opera, Firefox e Safari.

## Como funciona

A extensão fala direto com o **servidor self-hosted** (`apps/server`): monta a captura completa com o `@myndshelf/core` (OpenGraph, tipo, capa, lugares) e sobe como uma mudança da sincronização (`POST /api/sync/push`, coleção `captures`). Os apps recebem no próximo pull, como se viesse de outro aparelho.

- **Leitura da página**: o servidor lê o link (`/__og`, igual ao site), então o resultado é o mesmo dos apps. Se ele não conseguir (página atrás de login, intranet, servidor fora), vale o HTML da própria aba.
- **Sem conexão**: a captura já pronta vai para uma fila (`storage.local`) e sobe sozinha quando o servidor responde (a cada 2 min, ao abrir o navegador e ao reconectar). O selo do ícone mostra quantas esperam.
- **Permissões**: `activeTab` + `scripting` para ler a aba só quando você pede; o endereço do servidor é pedido ao conectar (`optional_host_permissions`). Nada mais sai do navegador.

## Jeitos de guardar

| | |
|---|---|
| Ícone ou `Alt+Shift+M` | popup com a página e um comentário (o texto selecionado já vem nele); `↵` guarda |
| `Alt+Shift+S` | guarda a aba na hora, sem abrir nada; o selo confirma (`✓`, `⏳` na fila, `!` erro) |
| Botão direito | página, link, imagem (vira prévia leve em data URL) ou seleção (vira nota com a fonte) |

## Rodando

```bash
corepack pnpm extension            # Chrome com hot reload (abre um perfil novo)
corepack pnpm extension:firefox    # o mesmo no Firefox
corepack pnpm extension:build      # .output/chrome-mv3 e .output/firefox-mv3
corepack pnpm extension:zip        # zips para as lojas
corepack pnpm --filter @myndshelf/extension build:edge
corepack pnpm --filter @myndshelf/extension build:safari   # depois: xcrun safari-web-extension-converter .output/safari-mv3
```

Para instalar à mão: Chrome/Edge → `chrome://extensions` → modo de desenvolvedor → *Carregar sem compactação* → `.output/chrome-mv3`. Firefox → `about:debugging` → *Carregar extensão temporária* → `.output/firefox-mv3/manifest.json`.

Depois, em **Ajustes** da extensão, cole o endereço do servidor e o token (`MYNDSHELF_TOKEN`).

## Estrutura

```
entrypoints/
  background.ts    menu de contexto, atalho, fila, selo do ícone
  popup/           guardar a aba atual com comentário
  options/         conectar ao servidor, fila, como usar
lib/
  capture.ts       entrada (página, texto, imagem) → CaptureItem, com o core
  queue.ts         salvar = montar + enfileirar + subir
  api.ts           cliente do servidor (contrato de packages/sync/protocol)
  settings.ts      servidor, id do aparelho, fila (storage do WXT)
  tab.ts           HTML e seleção da aba
```
