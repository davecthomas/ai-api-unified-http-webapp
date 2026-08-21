# ai-api-unified-http-webapp 1.4.0

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

Every command on this page runs in **this** repo.

The console needs a service to call, not the service's source. Any reachable
`ai-api-unified-http` will do, so the quickest start is to point it at one that
is already deployed.

Whatever you point it at has to admit this page's origin through CORS. The
service's default already admits `http://localhost:3000`, which is where this
serves. `make check` confirms it before you start blaming the page.

### At a service you already have a URL for

```bash
make open API=https://your-service.example KEY=your-key
make check API=https://your-service.example
```

### At your own Cloud Run deployment

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

Needs `gcloud` installed and authenticated against a project you can read.

### At a service running on your machine

This is the only mode that needs a second checkout:
[ai-api-unified-http](https://github.com/davecthomas/ai-api-unified-http).
Start it by following that repo's README — wherever you cloned it — then come
back here:

```bash
make serve                      # http://localhost:3000, expects the service on :8080
make serve API=http://localhost:9000 KEY=my-key
```

`make serve` prints a URL carrying `?base=` and `?key=`, so the page opens
already pointed at the right service with the key filled in. Both stay
editable in the page. `make open` does the same and opens a browser.

## What it exercises

| Tab | Endpoint |
|---|---|
| `GET /healthz` | Liveness and versions — sent with **no** key, since the path is public |
| `POST /v1/completions` | Buffered, or SSE streaming with the `stream` box |
| `POST /v1/structured` | Schema-validated output; the schema is editable JSON |
| `POST /v1/conversations/turn` | Multi-turn, with history kept in the page |
| `POST /v1/embeddings` | One input per line |
| `POST /v1/tokens/count` | Provider-side token count |
| `POST /v1/batches` | Submit many prompts as one job, at batch pricing |
| `GET /v1/batches/{id}` | Batch status and counts |
| `GET /v1/batches/{id}/results` | Per-request results, once ended |
| `POST /v1/batches/{id}/cancel` | Request cancellation |
| `POST /v1/images` | Generate images, then download each with a progress bar |
| `POST /v1/videos` | Start a video job, follow its progress, then download |
| `GET /v1/artifacts/{id}` | Download an artifact, optionally interrupted and resumed |
| `GET /v1/voices` | Voice catalogue with engine capabilities |
| `POST /v1/speech` | Synthesize speech; plays inline with a download bar |
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

**Completions can carry an image.** Pick a local file, which is sent base64
and counts against the service's 1 MiB body limit — or paste an `artifact_id`
from the images tab, which costs the body nothing because the bytes never
leave the server. Generate an image, paste its id, and ask about it: that
round trip is the demo.

**The status line prices each call.** `$0.000205, 173 tokens` appears beside
the HTTP status when the response carries cost. Cache writes are named
separately when present, because they are the counterintuitive part: writing
to a prompt cache bills above the input rate, and a caller warming a large
cache pays mostly for that.

**Two progress bars, because progress means two different things.** While a
video generates there are no bytes, so nothing can be measured: the service
publishes a figure and says whether it measured it. The generating bar is drawn
hatched and labelled *estimated* when that figure came from elapsed time rather
than from the provider, so a guess never looks like a measurement. While an
artifact downloads there is nothing to publish — `Content-Length` and the bytes
read are the whole answer — so the page counts it itself.

**Tick "simulate a dropped transfer"** on the artifact tab to see the point of
`Range`. The download is aborted at the halfway mark, resumed with
`Range: bytes=N-`, and the two halves are rejoined and compared. Generation is
the expensive half and is already paid for by then, so a failed transfer has to
be a re-download rather than a re-generation.

**Batches take four tabs, because they are four calls.** Submit returns a
`batch_id`; paste it into the status, results, and cancel tabs. The engine
travels with it every time, since a batch lives in one provider's account and
the id alone does not say which.

**Clearing the key shows the real 401.** `GET /healthz` is always sent without
one, so both the public and gated paths are visible.

## Configuration

Nothing is configured at build time. The API base URL and key come from the
query string (`?base=`, `?key=`) and are editable in the page, so the page can
be served from anywhere and pointed anywhere without a rebuild. Defaults are
`http://localhost:8080` and `local-dev-key`, which match a service started
with its own `make serve`.

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

That installs a `pre-push` hook refusing a direct push to `main`. A GitHub
ruleset enforces the same rule server-side, so the hook is a faster failure
rather than the thing standing in the way: it guards this clone only, and
`git push --no-verify` bypasses it.

## Development

No install step, no toolchain. Edit `src/index.html` or `src/app.js` and
reload.

Adding an endpoint means adding an entry to `ENDPOINTS` in `src/app.js`. Each
entry declares its fields and the form is built from that declaration, so no
form-handling code is written per endpoint.
