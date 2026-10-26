# MyndShelf · servidor self-hosted

Um container leve para um usuário só: API REST (Hono), SQLite com busca FTS5, arquivos da Estante numa pasta em disco, o site na raiz e a IA passando por aqui (a chave do Gemini não sai do servidor). O acesso é pelo Tailscale, e a API ainda exige um token.

Os apps continuam *local-first*: leem e escrevem no banco do aparelho, e a sincronização roda por trás. Sem conexão (Tailscale desligado, sem internet), tudo funciona igual: as mudanças entram numa fila e sobem quando o servidor volta a responder.

## Instalar no homelab

Precisa de Docker com Compose v2.24+ e do repositório clonado no servidor.

```bash
cd apps/server
cp .env.example .env
openssl rand -hex 32        # cole em MYNDSHELF_TOKEN no .env
docker compose up -d --build
```

O servidor fica em `http://127.0.0.1:8787`, só no host. Para os aparelhos chegarem com HTTPS válido, há dois caminhos.

**Tailscale no host** (o mais simples, se o homelab já está no tailnet):

```bash
sudo tailscale serve --bg 8787
```

Pronto: `https://<nome-do-host>.<seu-tailnet>.ts.net`.

**Tailscale no container**, quando o host não tem Tailscale: crie uma auth key em *Admin → Settings → Keys*, ponha em `TS_AUTHKEY` no `.env`, ligue *HTTPS Certificates* em *Admin → DNS* e suba com o override:

```bash
docker compose -f docker-compose.yml -f docker-compose.tailscale.yml up -d --build
```

O endereço fica `https://myndshelf.<seu-tailnet>.ts.net`.

## Ligar os aparelhos

Em cada app: **Ajustes → Servidor**, cole o endereço e o token e toque em *Conectar*. Na primeira vez, o que já existe no aparelho sobe (os itens de exemplo da primeira abertura ficam de fora) e o que está no servidor desce. Conflitos: o último a editar vence.

O site é o próprio endereço do servidor aberto no navegador; ele já vem com o endereço preenchido e só pede o token.

Arquivos da Estante: os metadados e as prévias sincronizam sempre; o original desce quando você abre o item e fica guardado no aparelho. *Manter arquivos offline* baixa todos de uma vez.

## Variáveis

| Variável | Padrão | |
|---|---|---|
| `MYNDSHELF_TOKEN` | (obrigatória) | token dos apps, 16+ caracteres |
| `GEMINI_API_KEY` | (vazia) | liga `/api/ai/…`; aparelhos sem chave própria usam esta |
| `DATA_DIR` | `/data` | banco (`myndshelf.db`) e pasta `files/` |
| `PUBLIC_DIR` | `/app/public` | build do site |
| `PORT` | `8787` | |

## Backup

O Litestream (no `docker-compose.yml`) replica o banco a cada segundo para `./backups`, ou para S3/MinIO/B2 se você ajustar o `litestream.yml`. Os arquivos ficam no volume, em `/data/files`; copie com `rsync`:

```bash
docker run --rm -v server_data:/data -v "$PWD/backups:/out" alpine sh -c "cp -a /data/files /out/"
```

(O nome do volume é `<pasta>_data`; confira com `docker volume ls`.)

Para restaurar o banco: pare o `myndshelf`, tire do caminho o `myndshelf.db` estragado (e os `-wal`/`-shm`) e rode

```bash
docker compose run --rm litestream restore -o /data/myndshelf.db /data/myndshelf.db
```

Também dá para baixar uma cópia legível do acervo, no mesmo JSON do *Exportar* dos apps:

```bash
curl -H "authorization: Bearer $MYNDSHELF_TOKEN" https://<servidor>/api/library -o acervo.json
```

## Atualizar

```bash
git pull && docker compose up -d --build
```

## API

Tudo em `/api/*` pede `authorization: Bearer <token>`, menos `/api/info`. O contrato (tipos) está em `packages/sync/src/protocol.ts`.

| Rota | |
|---|---|
| `GET /api/info` | versão e se há IA |
| `POST /api/sync/push` | `{ device, changes }` → grava; devolve em `stale` o que o servidor tem mais novo |
| `GET /api/sync/changes?since=&device=&limit=` | tudo que mudou desde o cursor (menos o que veio do próprio aparelho) |
| `GET/HEAD/PUT/DELETE /api/files/:id` | original de uma criação |
| `GET /api/search?q=` | busca de texto (ignora acentos) |
| `GET /api/library` | acervo inteiro em JSON |
| `POST /api/ai/gemini/<modelo>:<ação>` | repassa ao Gemini com a chave do servidor |
| `GET /__og?url=`, `/__resolve?url=` | leitura de links para o site |

## Desenvolvimento

Node 22.13+ (usa o `node:sqlite` embutido).

```bash
corepack pnpm --filter @myndshelf/server build
MYNDSHELF_TOKEN=dev-token-myndshelf-local DATA_DIR=./data PUBLIC_DIR=../desktop/dist node dist/main.js
corepack pnpm --filter @myndshelf/server test   # dois aparelhos simulados contra um servidor real
```
