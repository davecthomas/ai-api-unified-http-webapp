# ai-api-unified-http-webapp 0.1.0

Browser console for
[ai-api-unified-http](https://github.com/davecthomas/ai-api-unified-http). One
tab per endpoint, every field editable, so the service can be exercised by
hand without curl.

Plain HTML and JavaScript with no build step, no framework, and no
dependencies. It is served as static files and talks to the service over
`fetch`.

This lives outside the service repo on purpose. The service is a lean HTTP
wrapper around the `ai-api-unified` library; a sample consumer does not belong
in it, and the two version independently.

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

Three behaviors are worth knowing:

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
places, kept in sync: the title of this file and `src/app.js`. The service's
version and this one move separately — that independence is the reason the
repos are separate.

Bump **minor** when a tab or field is added, **patch** for fixes and copy
changes, and **major** if the page stops working against a service version it
previously supported.

## Development

No install step, no toolchain. Edit `src/index.html` or `src/app.js` and
reload.

Adding an endpoint means adding an entry to `ENDPOINTS` in `src/app.js`. Each
entry declares its fields and the form is built from that declaration, so no
form-handling code is written per endpoint.
