# ai-api-unified-http-webapp 1.1.0

Browser console for
[ai-api-unified-http](https://github.com/davecthomas/ai-api-unified-http). One
tab per endpoint, every field editable, so the service can be exercised by
hand without curl.

Plain HTML and JavaScript with no build step and no framework. Styling comes
from [Pico CSS](https://picocss.com) (MIT), vendored into `src/vendor/` rather
than loaded from a CDN, so the page works offline and pulls nothing at
runtime. `src/console.css` adds only what a classless framework has no opinion
about: the endpoint tab strip, the response pane, and the lineage banner.

## Where this sits

```
  ┌─────────────────────────────────────────────────────────────────┐
  │  ai-api-unified-http-webapp   ← you are here                    │
  │  Browser console. Static HTML + JS, no build step.              │
  └───────────────────────────────┬─────────────────────────────────┘
                                  │  fetch + SSE, bearer token
                                  ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │  ai-api-unified-http                                            │
  │  FastAPI service. Auth, client pooling, SSE bridging,           │
  │  error mapping, cost capture. A thin adapter and nothing more.  │
  └───────────────────────────────┬─────────────────────────────────┘
                                  │  in-process import
                                  ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │  ai-api-unified            ★ the library this exists to show    │
  │  One Python interface across OpenAI, Anthropic, Google and      │
  │  more, plus the pricing registry, model lifecycle enforcement,  │
  │  cost attribution, and PII/observability middleware.            │
  └───────────────────────────────┬─────────────────────────────────┘
                                  │  provider SDKs
                                  ▼
                   OpenAI · Anthropic · Google · Bedrock · Voyage
```

| Layer | Repo | Role |
|---|---|---|
| Console | [ai-api-unified-http-webapp](https://github.com/davecthomas/ai-api-unified-http-webapp) | This repo. Exercises every endpoint by hand. |
| Service | [ai-api-unified-http](https://github.com/davecthomas/ai-api-unified-http) | Exposes the library over HTTP for non-Python callers. |
| **Library** | **[ai-api-unified](https://github.com/davecthomas/ai-api-unified)** | **The product.** Everything above exists to show it working. |

The layers are separate repos so each versions on its own, and so the service
stays a lean wrapper rather than absorbing a sample consumer.

## Run

The service must be running first. In its checkout:

```bash
make serve          # http://localhost:8080, API key: local-dev-key
```

Then here:

```bash
make serve                      # http://localhost:3000
make serve API=http://localhost:9000 KEY=my-key
```

`make serve` prints a URL carrying `?base=` and `?key=`, so the page opens
already pointed at the right service with the key filled in. Both stay
editable in the page.

`make open` does the same and opens a browser.

### Against a deployed service

The page runs locally and calls whatever service you point it at, so the same
console drives a Cloud Run deployment:

```bash
make remote PROJECT=your-gcp-project-id
```

The base URL is read from the deployment rather than pasted, because a Cloud
Run URL carries a generated hash that nobody remembers and that changes if the
service is recreated.

The key is not fetched into the URL. A deployed key spends real provider
credits, and a URL lands in shell history and then browser history, so the
command to read it is printed instead and the page's key field shows a
placeholder. Paste it into the field, which is one place you can clear.

The deployment has to admit this origin. `make gcp-deploy` sets
`HTTP_CORS_ORIGINS` to `http://localhost:3000` by default, which is where this
serves; `make check` confirms it.

```bash
make check API=https://your-service.run.app
```

## What it exercises

| Tab | Endpoint |
|---|---|
| `GET /healthz` | Liveness and versions — sent with **no** key, since the path is public |
| `POST /v1/completions` | Buffered, or SSE streaming with the `stream` box |
| `POST /v1/structured` | Schema-validated output; the schema is editable JSON |
| `POST /v1/conversations/turn` | Multi-turn, with history kept in the page |
| `POST /v1/embeddings` | One input per line |
| `POST /v1/tokens/count` | Provider-side token count |
| `GET /v1/models` | Model catalog with lifecycle and pricing |

**Streaming renders as it arrives**, chunk by chunk with a running count.
Buffering the whole SSE body first would show a finished answer and prove
nothing about streaming. A terminal `error` event is shown as a failure even
though the response began with 200 — the status line was already sent when the
stream broke.

**The conversation tab keeps history in the page**, because the service is
stateless. Each `conversation_token` is stored as the content of an assistant
message in the position that turn happened, which is the contract the service
expects. Send once, then ask "What is my favorite color?" to watch context
carry across turns. The token is opaque and this page never looks inside it.

**Clearing the key shows the real 401.** `GET /healthz` is always sent without
one, so both the public and gated paths are visible.

## Configuration

Nothing is configured at build time. The API base URL and key come from the
query string (`?base=`, `?key=`) and are editable in the page. Defaults are
`http://localhost:8080` and `local-dev-key`, matching the service's `make
serve`.

The service must allow this origin through CORS. Its default already admits
`http://localhost:3000`; a service on another host needs `HTTP_CORS_ORIGINS`
set to include wherever this page is served from.

## Versioning

Semantic versioning, independent of the service. The version lives in two
places, kept in sync: the title of this file and `VERSION` in `src/app.js`,
which renders beside the page heading. The service's version and this one move
separately.

`1.0.0` marks the console covering the service's full v1 surface: every
endpoint has a tab, streaming renders incrementally, and conversations carry
context across turns.

Bump **minor** when a tab or field is added, **patch** for fixes and copy
changes, and **major** if the page stops working against a service version it
previously supported.

## Contributing

`main` takes changes through pull requests. Run this once per clone:

```bash
make hooks          # git config core.hooksPath .githooks
```

That installs a `pre-push` hook refusing a direct push to `main`. It guards
this clone only, and `git push --no-verify` bypasses it. The sibling public
repos have the same rule enforced server-side by a GitHub ruleset; a private
repo below the Pro plan cannot have one, so making this repo public or
upgrading the plan is what replaces the hook with real enforcement.

## Development

No install step, no toolchain. Edit `src/index.html` or `src/app.js` and
reload.

Adding an endpoint means adding an entry to `ENDPOINTS` in `src/app.js`. Each
entry declares its fields and the form is built from that declaration, so no
form-handling code is written per endpoint.
