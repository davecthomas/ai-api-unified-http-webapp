// Browser console for ai-api-unified-http.
//
// Plain HTML and JS with no build step, served by `make serve` on port 3000
// while the service runs on 8080 with CORS for this origin enabled.
//
// Versioned independently of the service. Keep VERSION in sync with the
// README title; nothing else records it.
//
// Each endpoint declares its fields and the form is built from that
// declaration, so adding an endpoint means adding an ENDPOINTS entry rather
// than writing new form-handling code.
//
// Two behaviors are worth knowing before reading further:
//
//   - Streaming completions are read incrementally and rendered as they
//     arrive. Buffering the whole SSE body first would display a finished
//     answer and prove nothing about streaming.
//   - The conversation tab keeps history in the page, because the service is
//     stateless. It stores the returned conversation_token as the content of
//     an assistant message positioned where that turn happened, which is the
//     contract the service expects.

// Keep in sync with the README title.
const VERSION = "1.4.0";

const PARAMS = new URLSearchParams(location.search);

const els = {
  base: document.getElementById("base"),
  baseUrl: document.getElementById("baseUrl"),
  apikey: document.getElementById("apikey"),
  tabs: document.getElementById("tabs"),
  form: document.getElementById("form"),
  status: document.getElementById("status"),
  out: document.getElementById("out"),
};

document.title = `ai-api-unified-http console ${VERSION}`;
const media = {
  phases: document.getElementById("phases"),
  generate: document.getElementById("phase-generate"),
  generateBar: document.getElementById("generate-bar"),
  generateDetail: document.getElementById("generate-detail"),
  transfer: document.getElementById("phase-transfer"),
  transferBar: document.getElementById("transfer-bar"),
  transferDetail: document.getElementById("transfer-detail"),
  preview: document.getElementById("preview"),
};

const versionEl = document.getElementById("version");
if (versionEl) versionEl.textContent = VERSION;

els.baseUrl.value = PARAMS.get("base") || "http://localhost:8080";
els.apikey.value = PARAMS.get("key") || "local-dev-key";
const syncBase = () => (els.base.textContent = els.baseUrl.value);
els.baseUrl.addEventListener("input", syncBase);
syncBase();

// ---------------------------------------------------------------------------
// Endpoint declarations
// ---------------------------------------------------------------------------

const ENGINES = ["claude", "openai", "google-gemini"];
const EMBED_ENGINES = ["google-gemini", "openai", "voyage"];

const ENDPOINTS = [
  {
    id: "health",
    label: "GET /healthz",
    method: "GET",
    path: () => "/healthz",
    anonymous: true, // public, so this proves the service answers without a key
    fields: [],
  },
  {
    id: "completions",
    label: "POST /v1/completions",
    method: "POST",
    path: () => "/v1/completions",
    fields: [
      { name: "engine", type: "select", options: ENGINES, value: "claude" },
      { name: "model", type: "text", value: "claude-haiku-4-5", optional: true },
      { name: "prompt", type: "textarea", value: "Name three primary colors." },
      { name: "system_prompt", type: "text", value: "", optional: true },
      { name: "max_response_tokens", type: "number", value: "", optional: true },
      { name: "request_timeout_seconds", type: "number", value: "", optional: true },
      { name: "stream", type: "checkbox", value: false },
      {
        name: "attach_image",
        type: "file",
        accept: "image/*",
        optional: true,
        hint: "sent base64; counts against the 1 MiB body limit",
      },
      {
        name: "attach_artifact_id",
        type: "text",
        value: "",
        optional: true,
        hint: "an id from the images tab — no body weight, no re-upload",
      },
    ],
    note:
      "Attachments work on the streaming path too. Generate an image on the " +
      "images tab, paste its artifact_id here, and ask about it — the bytes " +
      "never leave the server.",
    note:
      "With stream checked the response is SSE and renders as it arrives. " +
      "max_response_tokens and request_timeout_seconds are rejected with 400 " +
      "while streaming, because the library's streaming call cannot honor them.",
  },
  {
    id: "structured",
    label: "POST /v1/structured",
    method: "POST",
    path: () => "/v1/structured",
    fields: [
      { name: "engine", type: "select", options: ENGINES, value: "claude" },
      { name: "model", type: "text", value: "claude-haiku-4-5", optional: true },
      {
        name: "prompt",
        type: "textarea",
        value: "Extract the person: Jane Doe, age 34.",
      },
      {
        name: "response_schema",
        type: "json",
        value: JSON.stringify(
          {
            type: "object",
            properties: { name: { type: "string" }, age: { type: "integer" } },
            required: ["name", "age"],
          },
          null,
          2
        ),
      },
      { name: "max_response_tokens", type: "number", value: "", optional: true },
    ],
    note:
      "data is null whenever finish_reason is not 'complete'. Read " +
      "finish_reason first, or a truncated answer looks like an empty one.",
  },
  {
    id: "conversation",
    label: "POST /v1/conversations/turn",
    method: "POST",
    path: () => "/v1/conversations/turn",
    conversation: true,
    fields: [
      { name: "engine", type: "select", options: ENGINES, value: "claude" },
      { name: "model", type: "text", value: "claude-haiku-4-5", optional: true },
      { name: "system_prompt", type: "text", value: "You are terse." },
      {
        name: "message",
        type: "textarea",
        value: "My favorite color is teal. Reply OK.",
      },
      { name: "max_response_tokens", type: "number", value: "128", optional: true },
    ],
    note:
      "History lives in this page because the service is stateless. Send " +
      "once, then ask 'What is my favorite color?' to watch the token carry " +
      "context across turns.",
  },
  {
    id: "embeddings",
    label: "POST /v1/embeddings",
    method: "POST",
    path: () => "/v1/embeddings",
    fields: [
      {
        name: "engine",
        type: "select",
        options: EMBED_ENGINES,
        value: "google-gemini",
      },
      { name: "model", type: "text", value: "", optional: true },
      {
        name: "inputs",
        type: "lines",
        value: "hello world\nthe second input",
        hint: "one input per line",
      },
    ],
  },
  {
    id: "tokens",
    label: "POST /v1/tokens/count",
    method: "POST",
    path: () => "/v1/tokens/count",
    fields: [
      { name: "engine", type: "select", options: ENGINES, value: "claude" },
      { name: "model", type: "text", value: "claude-haiku-4-5", optional: true },
      {
        name: "prompt",
        type: "textarea",
        value: "How many tokens is this sentence?",
      },
    ],
  },
  {
    id: "batch-submit",
    label: "POST /v1/batches",
    method: "POST",
    path: () => "/v1/batches",
    fields: [
      { name: "engine", type: "select", options: ENGINES, value: "claude" },
      { name: "model", type: "text", value: "claude-haiku-4-5", optional: true },
      {
        name: "requests",
        type: "json",
        value: JSON.stringify(
          [
            { custom_id: "row-1", prompt: "Classify as positive or negative: great." },
            { custom_id: "row-2", prompt: "Classify as positive or negative: awful." },
          ],
          null,
          2,
        ),
        hint: "each item needs a custom_id unique within the batch",
      },
    ],
    note:
      "Batch runs at about half the interactive rate and returns in hours, " +
      "not seconds. Copy the batch_id from the response into the other batch " +
      "tabs; it has to travel with the same engine, because a batch lives in " +
      "one provider's account.",
  },
  {
    id: "batch-status",
    label: "GET /v1/batches/{id}",
    method: "GET",
    path: (values) =>
      `/v1/batches/${encodeURIComponent(values.batch_id)}` +
      `?engine=${encodeURIComponent(values.engine)}` +
      (values.model ? `&model=${encodeURIComponent(values.model)}` : ""),
    fields: [
      { name: "batch_id", type: "text", value: "", pathOnly: true },
      {
        name: "engine",
        type: "select",
        options: ENGINES,
        value: "claude",
        pathOnly: true,
      },
      { name: "model", type: "text", value: "", optional: true, pathOnly: true },
    ],
    note: "Results are available once status is 'ended'.",
  },
  {
    id: "batch-results",
    label: "GET /v1/batches/{id}/results",
    method: "GET",
    path: (values) =>
      `/v1/batches/${encodeURIComponent(values.batch_id)}/results` +
      `?engine=${encodeURIComponent(values.engine)}` +
      (values.model ? `&model=${encodeURIComponent(values.model)}` : ""),
    fields: [
      { name: "batch_id", type: "text", value: "", pathOnly: true },
      {
        name: "engine",
        type: "select",
        options: ENGINES,
        value: "claude",
        pathOnly: true,
      },
      { name: "model", type: "text", value: "", optional: true, pathOnly: true },
    ],
    note:
      "Correlate by custom_id: providers return results in their own order. " +
      "An item can fail while the batch ends normally, so read each item's " +
      "status before its text.",
  },
  {
    id: "batch-cancel",
    label: "POST /v1/batches/{id}/cancel",
    method: "POST",
    path: (values) =>
      `/v1/batches/${encodeURIComponent(values.batch_id)}/cancel` +
      `?engine=${encodeURIComponent(values.engine)}` +
      (values.model ? `&model=${encodeURIComponent(values.model)}` : ""),
    fields: [
      { name: "batch_id", type: "text", value: "", pathOnly: true },
      {
        name: "engine",
        type: "select",
        options: ENGINES,
        value: "claude",
        pathOnly: true,
      },
      { name: "model", type: "text", value: "", optional: true, pathOnly: true },
    ],
    note:
      "Cancellation is a request, not a guarantee. Items already processed " +
      "stay processed and stay billed, which is why the response carries the " +
      "counts.",
  },
  {
    id: "images",
    label: "POST /v1/images",
    method: "POST",
    path: () => "/v1/images",
    media: "image",
    fields: [
      { name: "prompt", type: "textarea", value: "A red bicycle against a white wall." },
      { name: "model", type: "text", value: "", optional: true },
      { name: "num_images", type: "number", value: "1" },
      { name: "image_format", type: "select", options: ["png", "jpeg", "webp"], value: "png" },
      { name: "width", type: "number", value: "", optional: true },
      { name: "height", type: "number", value: "", optional: true },
    ],
    note:
      "The response carries references, not bytes. Each one is then fetched " +
      "with its own progress bar, which this page draws from Content-Length " +
      "and nothing else.",
  },
  {
    id: "videos",
    label: "POST /v1/videos",
    method: "POST",
    path: () => "/v1/videos",
    media: "video",
    fields: [
      { name: "prompt", type: "textarea", value: "A sunset over calm water." },
      { name: "engine", type: "text", value: "", optional: true },
      { name: "model", type: "text", value: "", optional: true },
      { name: "duration_seconds", type: "number", value: "5", optional: true },
    ],
    note:
      "Video takes minutes, so it is a job. This page follows the progress " +
      "stream while it generates, then downloads with a second bar. Watch the " +
      "first bar say 'estimated' when the provider reports no figure of its own.",
  },
  {
    id: "artifact",
    label: "GET /v1/artifacts/{id}",
    method: "GET",
    path: (values) => `/v1/artifacts/${encodeURIComponent(values.artifact_id)}/content`,
    media: "fetch",
    fields: [
      { name: "artifact_id", type: "text", value: "", pathOnly: true },
      { name: "simulate_a_dropped_transfer", type: "checkbox", value: false },
    ],
    note:
      "Paste an artifact_id from an images or videos response. Tick the box " +
      "to abort halfway and resume with a Range request: the two halves are " +
      "rejoined and compared, because generation is already paid for and a " +
      "failed transfer must not repeat it.",
  },
  {
    id: "voices",
    label: "GET /v1/voices",
    method: "GET",
    path: (values) =>
      "/v1/voices" +
      (values.locale ? `?locale=${encodeURIComponent(values.locale)}` : ""),
    fields: [
      {
        name: "locale",
        type: "text",
        value: "",
        optional: true,
        pathOnly: true,
        hint: "e.g. en-US — an engine can publish thousands of voices",
      },
    ],
    note:
      "Read capabilities before building a speech request: engines disagree " +
      "on streaming, emotion control, and SSML, and the ones that lack a " +
      "feature refuse it rather than ignoring it.",
  },
  {
    id: "speech",
    label: "POST /v1/speech",
    method: "POST",
    path: () => "/v1/speech",
    media: "speech",
    fields: [
      {
        name: "text",
        type: "textarea",
        value: "The quick brown fox jumps over the lazy dog.",
      },
      { name: "voice_id", type: "text", value: "", optional: true, hint: "from the voices tab" },
      { name: "audio_format", type: "text", value: "mp3_24000", optional: true },
      { name: "speaking_rate", type: "number", value: "1.0", optional: true },
    ],
    note:
      "The clip is stored like a generated image and fetched with the same " +
      "progress bar, then plays inline.",
  },
  {
    id: "models",
    label: "GET /v1/models",
    method: "GET",
    path: (values) => `/v1/models?engine=${encodeURIComponent(values.engine)}`,
    fields: [{ name: "engine", type: "select", options: ENGINES, value: "claude" }],
    note:
      "engine is required: listing every engine would construct a client per " +
      "engine on one request. 'models' is what the provider reports and " +
      "'catalog' is the library's registry; a model can be in one and not the " +
      "other.",
  },
];

// ---------------------------------------------------------------------------
// Form rendering
// ---------------------------------------------------------------------------

let active = ENDPOINTS[1];
let history = []; // conversation tab only

const fieldId = (name) => `f_${name}`;

function renderTabs() {
  els.tabs.replaceChildren();
  for (const endpoint of ENDPOINTS) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = endpoint.label;
    button.setAttribute("role", "tab");
    button.setAttribute("aria-selected", String(endpoint === active));
    button.onclick = () => {
      active = endpoint;
      renderTabs();
      // fresh: switching endpoints must not carry a value across. Field names
      // repeat between endpoints, so a Claude model would otherwise leak into
      // the embeddings tab.
      renderForm({ fresh: true });
    };
    els.tabs.appendChild(button);
  }
}

// Re-rendering rebuilds inputs from the declarations, which would throw away
// whatever the user typed. Current values are carried across instead, so
// sending a turn does not reset the engine or model that was chosen.
function renderForm(options = {}) {
  const carried = options.fresh ? {} : currentValues();
  els.form.replaceChildren();

  for (const field of active.fields) {
    if (Object.hasOwn(carried, field.name)) field.value = carried[field.name];

    if (field.type === "checkbox") {
      const row = document.createElement("label");
      row.className = "checkbox-row";
      const box = document.createElement("input");
      box.type = "checkbox";
      box.checked = Boolean(field.value);
      box.id = fieldId(field.name);
      row.append(box, document.createTextNode(field.name));
      els.form.appendChild(row);
      continue;
    }

    const label = document.createElement("label");
    const title = document.createElement("span");
    title.className = "field-label";
    title.textContent = field.name;
    if (field.optional || field.hint) {
      const extra = document.createElement("span");
      extra.className = "optional";
      extra.textContent =
        (field.optional ? " (optional)" : "") +
        (field.hint ? ` — ${field.hint}` : "");
      title.appendChild(extra);
    }
    label.appendChild(title);

    let input;
    if (field.type === "file") {
      input = document.createElement("input");
      input.type = "file";
      input.accept = field.accept || "image/*";
      // The chosen file is read immediately and held as base64 on the field,
      // because readValues is synchronous and a FileReader is not.
      input.addEventListener("change", () => {
        const chosen = input.files && input.files[0];
        if (!chosen) {
          field._data = null;
          return;
        }
        const reader = new FileReader();
        reader.onload = () => {
          field._data = {
            mime_type: chosen.type || "application/octet-stream",
            data: String(reader.result).split(",", 2)[1],
          };
        };
        reader.readAsDataURL(chosen);
      });
    } else if (field.type === "select") {
      input = document.createElement("select");
      for (const option of field.options) {
        const element = document.createElement("option");
        element.value = option;
        element.textContent = option;
        input.appendChild(element);
      }
      input.value = field.value;
    } else if (["textarea", "json", "lines"].includes(field.type)) {
      input = document.createElement("textarea");
      input.value = field.value;
      input.rows = field.type === "json" ? 10 : 4;
    } else {
      input = document.createElement("input");
      input.type = field.type === "number" ? "number" : "text";
      input.value = field.value;
      input.spellcheck = false;
    }
    input.id = fieldId(field.name);
    label.appendChild(input);
    els.form.appendChild(label);
  }

  if (active.note) {
    const note = document.createElement("p");
    note.className = "note";
    note.textContent = active.note;
    els.form.appendChild(note);
  }

  const actions = document.createElement("div");
  actions.className = "actions";

  const send = document.createElement("button");
  send.type = "button";
  send.textContent = `Send ${active.method} ${
    active.path({ engine: "x" }).split("?")[0]
  }`;
  send.onclick = () => run(send);
  actions.appendChild(send);

  if (active.conversation) {
    const reset = document.createElement("button");
    reset.type = "button";
    reset.className = "secondary";
    reset.textContent = `Reset history (${history.length} messages)`;
    reset.onclick = () => {
      history = [];
      renderForm({ fresh: true });
      write("muted", "Conversation history cleared.", "");
    };
    actions.appendChild(reset);
  }

  els.form.appendChild(actions);
}


function readValues() {
  const values = {};
  for (const field of active.fields) {
    const input = document.getElementById(fieldId(field.name));
    if (!input) continue;
    if (field.type === "file") {
      values[field.name] = field._data || null;
    } else if (field.type === "checkbox") {
      values[field.name] = input.checked;
    } else if (field.type === "lines") {
      values[field.name] = input.value
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
    } else if (field.type === "json") {
      values[field.name] = input.value;
    } else if (field.type === "number") {
      values[field.name] = input.value === "" ? null : Number(input.value);
    } else {
      values[field.name] = input.value.trim() === "" ? null : input.value;
    }
  }
  return values;
}

function buildBody(values) {
  if (active.id === "conversation") {
    // The service holds no state, so the full history travels every turn. The
    // previous turn's token sits where that turn happened, which is why this
    // page tracks position instead of letting the service append.
    const messages = [...history];
    if (values.message) messages.push({ role: "user", content: values.message });
    return {
      engine: values.engine,
      model: values.model,
      system_prompt: values.system_prompt,
      messages,
      max_response_tokens: values.max_response_tokens,
    };
  }

  // The two attachment inputs collapse into the service's attachments list.
  const attachments = [];
  if (values.attach_image) attachments.push(values.attach_image);
  if (values.attach_artifact_id) {
    attachments.push({ artifact_id: values.attach_artifact_id });
  }
  delete values.attach_image;
  delete values.attach_artifact_id;

  const jsonFields = new Set(
    active.fields.filter((f) => f.type === "json").map((f) => f.name),
  );
  // Some fields only address the resource — a batch id, the engine holding it —
  // and belong in the path or query string rather than in the body.
  const pathOnly = new Set(
    active.fields.filter((f) => f.pathOnly).map((f) => f.name),
  );

  const body = {};
  for (const [key, value] of Object.entries(values)) {
    if (value === null || value === undefined) continue;
    if (pathOnly.has(key)) continue;
    body[key] = jsonFields.has(key) ? JSON.parse(value) : value;
  }
  if (attachments.length) body.attachments = attachments;
  return body;
}

// ---------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------

function cssClass(status) {
  if (status >= 200 && status < 300) return "ok";
  if (status >= 400 && status < 500) return "warn";
  return "err";
}

function write(kind, heading, body) {
  els.status.className = kind;
  els.status.textContent = heading;
  els.out.textContent = body;
}

// One glance at what a call cost, without digging in the JSON. Cache writes
// are called out because they are the counterintuitive part: writing to a
// cache bills above the input rate, and a caller warming a large cache pays
// mostly for that.
function costSummary(text) {
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    return "";
  }
  const parts = [];
  if (body.usd_cost) parts.push(`$${body.usd_cost}`);
  const usage = body.usage;
  if (usage) {
    const writes = (usage.cache_write_5m_tokens || 0) + (usage.cache_write_1h_tokens || 0);
    if (usage.total_tokens) parts.push(`${usage.total_tokens} tokens`);
    if (writes) parts.push(`${writes} cache-write`);
    if (usage.cached_input_tokens) parts.push(`${usage.cached_input_tokens} cached`);
  }
  return parts.length ? ` — ${parts.join(", ")}` : "";
}

function pretty(text) {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

function explain(status, body) {
  if (status === 401) {
    return "\n\nThe API key was missing or wrong. Check the key field above.";
  }
  if (status === 400 && body.includes("treaming")) {
    return (
      "\n\nEither these fields cannot be applied to a stream, or PII " +
      "redaction is enabled in config/middleware.yaml: the library refuses " +
      "to stream while redaction is on."
    );
  }
  return "";
}

async function run(button) {
  const values = readValues();
  const base = els.baseUrl.value.replace(/\/$/, "");
  const key = els.apikey.value.trim();

  let path;
  let body = null;
  try {
    path = active.path(values);
    if (active.method === "POST") body = buildBody(values);
  } catch (error) {
    write("err", "Request not sent", `Could not build the request: ${error}`);
    return;
  }

  const headers = {};
  if (!active.anonymous && key) headers.authorization = `Bearer ${key}`;
  if (body) headers["content-type"] = "application/json";

  button.disabled = true;
  const started = performance.now();
  resetMedia();
  write("muted", `${active.method} ${path} …`, "");

  try {
    const response = await fetch(base + path, {
      method: active.method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    const streaming = (response.headers.get("content-type") || "").includes(
      "text/event-stream"
    );
    if (streaming && response.ok) {
      await renderStream(response, started);
      return;
    }

    if (active.media && response.ok) {
      await renderMedia(active.media, response, { base, key, values, started });
      return;
    }

    const text = await response.text();
    const ms = Math.round(performance.now() - started);
    write(
      cssClass(response.status),
      `${active.method} ${path} → HTTP ${response.status} (${ms} ms)${costSummary(text)}`,
      pretty(text) + explain(response.status, text)
    );
    if (active.id === "conversation" && response.ok) {
      rememberTurn(values, JSON.parse(text));
    }
  } catch (error) {
    write(
      "err",
      `${active.method} ${path} → network error`,
      `${error}\n\nIs the service running? Start it with: make all`
    );
  } finally {
    button.disabled = false;
  }
}

async function renderStream(response, started) {
  // Read incrementally: buffering the whole body first would display a
  // finished answer and prove nothing about streaming.
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let chunks = 0;

  els.status.className = "ok";
  els.out.textContent = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const blocks = buffer.split("\n\n");
    buffer = blocks.pop() || "";
    for (const block of blocks) {
      let event = "";
      let data = "";
      for (const line of block.split("\n")) {
        if (line.startsWith("event: ")) event = line.slice(7);
        else if (line.startsWith("data: ")) data = line.slice(6);
      }
      if (!event) continue;
      const payload = data ? JSON.parse(data) : {};
      const ms = Math.round(performance.now() - started);

      if (event === "chunk") {
        chunks += 1;
        text += payload.text || "";
        els.status.textContent = `streaming… ${chunks} chunks, ${ms} ms`;
        els.out.textContent = text;
      } else if (event === "done") {
        els.status.textContent = `stream complete → ${payload.chunks} chunks, ${ms} ms`;
      } else if (event === "error") {
        // The 200 status line was already sent when this failed, so the
        // failure arrives in-band. It is still a failed call.
        els.status.className = "err";
        els.status.textContent = `stream failed after ${payload.chunks_delivered} chunks`;
        els.out.textContent = `${text}\n\n--- ${payload.error} ---\n${payload.detail}`;
      }
    }
  }
}

function rememberTurn(values, turn) {
  if (values.message) history.push({ role: "user", content: values.message });
  if (turn.conversation_token) {
    // Stored as the assistant turn's content, in the position it happened.
    // The token is opaque; this page never looks inside it.
    history.push({ role: "assistant", content: turn.conversation_token });
  }
  renderForm();
  // Clear only the message, so the next turn starts on an empty box while the
  // engine, model, and system prompt stay as chosen.
  const message = document.getElementById(fieldId("message"));
  if (message) {
    message.value = "";
    message.focus();
  }
}

renderTabs();
renderForm({ fresh: true });


// ---------------------------------------------------------------------------
// Generated media
//
// Progress means two different things here and they are measured two different
// ways, which is why there are two bars.
//
// While a video generates there are no bytes, so nothing can be measured; the
// service publishes a figure and says whether it measured it. While an
// artifact downloads there is nothing to publish, because Content-Length plus
// the bytes read is the whole answer.
// ---------------------------------------------------------------------------

function resetMedia() {
  media.phases.hidden = true;
  media.generate.hidden = true;
  media.transfer.hidden = true;
  media.generate.classList.remove("estimated");
  media.generateBar.value = 0;
  media.transferBar.value = 0;
  media.generateDetail.textContent = "";
  media.transferDetail.textContent = "";
  media.preview.hidden = true;
  media.preview.replaceChildren();
}

function showPhase(phase) {
  media.phases.hidden = false;
  phase.hidden = false;
}

function kb(bytes) {
  return bytes >= 1048576
    ? `${(bytes / 1048576).toFixed(1)} MB`
    : `${Math.round(bytes / 1024)} kB`;
}

async function renderMedia(kind, response, context) {
  const payload = await response.json();
  if (kind === "image") return renderImages(payload, context);
  if (kind === "video") return followVideo(payload, context);
  if (kind === "speech") return renderSpeech(payload, context);
  return renderDirectFetch(context);
}

async function renderSpeech(payload, { base, key, started }) {
  const ref = payload.artifact;
  write("ok", "synthesized, downloading…", pretty(JSON.stringify(payload)));
  const result = await fetchArtifact(base + ref.url_path, key, {
    onProgress: trackTransfer(""),
  });
  const url = URL.createObjectURL(result.bytes);
  const audio = document.createElement("audio");
  audio.controls = true;
  audio.src = url;
  const caption = document.createElement("figcaption");
  const seconds = payload.duration_seconds;
  caption.textContent =
    `${payload.voice_id || "default voice"} · ${kb(result.received)}` +
    (seconds ? ` · ${seconds.toFixed(1)}s` : "");
  const figure = document.createElement("figure");
  figure.append(audio, caption);
  media.preview.hidden = false;
  media.preview.append(figure);
  const ms = Math.round(performance.now() - started);
  write("ok", `speech ready in ${ms} ms`, pretty(JSON.stringify(payload)));
}

// Fetch an artifact and report progress from Content-Length. This is the whole
// mechanism: no side channel, no framing. A body read incrementally and a
// length header are enough.
async function fetchArtifact(url, key, { onProgress, range, signal } = {}) {
  const headers = { authorization: `Bearer ${key}` };
  if (range) headers.range = range;

  const response = await fetch(url, { headers, signal });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  }

  const total = Number(response.headers.get("content-length")) || 0;
  const reader = response.body.getReader();
  const parts = [];
  let received = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    received += value.length;
    if (onProgress) onProgress(received, total);
  }

  return {
    bytes: new Blob(parts),
    received,
    total,
    status: response.status,
    contentRange: response.headers.get("content-range"),
    mime: response.headers.get("content-type") || "application/octet-stream",
  };
}

function trackTransfer(label) {
  showPhase(media.transfer);
  return (received, total) => {
    media.transferBar.value = total ? (received / total) * 100 : 0;
    media.transferBar.max = 100;
    media.transferDetail.textContent = total
      ? `${label}${kb(received)} of ${kb(total)}`
      : `${label}${kb(received)}`;
  };
}

function preview(blob, mime, caption) {
  const url = URL.createObjectURL(blob);
  const figure = document.createElement("figure");
  const node = document.createElement(mime.startsWith("video/") ? "video" : "img");
  node.src = url;
  if (mime.startsWith("video/")) {
    node.controls = true;
  } else {
    node.alt = caption;
  }
  const label = document.createElement("figcaption");
  label.textContent = caption;
  figure.append(node, label);
  media.preview.hidden = false;
  media.preview.append(figure);
}

async function renderImages(payload, { base, key, started }) {
  const refs = payload.artifacts || [];
  write("ok", `generated ${refs.length} image(s), downloading…`, pretty(JSON.stringify(payload)));

  for (const [index, ref] of refs.entries()) {
    const label = refs.length > 1 ? `image ${index + 1}/${refs.length}: ` : "";
    const result = await fetchArtifact(base + ref.url_path, key, {
      onProgress: trackTransfer(label),
    });
    preview(result.bytes, result.mime, `${ref.artifact_id.slice(0, 8)}… ${kb(result.received)}`);
  }

  const ms = Math.round(performance.now() - started);
  write(
    "ok",
    `${refs.length} image(s) generated and downloaded in ${ms} ms`,
    pretty(JSON.stringify(payload))
  );
}

// Follow a job's published progress, then download what it produced. The
// estimated flag decides how the bar is drawn: a figure derived from elapsed
// time must not look like one derived from bytes.
async function followVideo(job, { base, key, started }) {
  showPhase(media.generate);
  media.generateDetail.textContent = "queued";
  write("muted", `job ${job.job_id} queued…`, pretty(JSON.stringify(job)));

  const events = await fetch(`${base}/v1/videos/${job.job_id}/events`, {
    headers: { authorization: `Bearer ${key}` },
  });
  const reader = events.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let final = null;
  let failure = null;

  outer: for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split("\n\n");
    buffer = blocks.pop() || "";

    for (const block of blocks) {
      let event = "";
      let data = "";
      for (const line of block.split("\n")) {
        if (line.startsWith("event: ")) event = line.slice(7);
        else if (line.startsWith("data: ")) data = line.slice(6);
      }
      if (!event) continue;
      const payload = data ? JSON.parse(data) : {};

      if (event === "progress") {
        media.generateBar.value = payload.percent || 0;
        media.generate.classList.toggle("estimated", payload.estimated === true);
        media.generateDetail.textContent = `${payload.status} ${Math.round(payload.percent || 0)}%`;
      } else if (event === "done") {
        final = payload;
        break outer;
      } else if (event === "error") {
        failure = payload.error || "generation failed";
        break outer;
      }
    }
  }

  if (failure) {
    write("err", `job ${job.job_id} failed`, failure);
    return;
  }

  media.generateBar.value = 100;
  media.generate.classList.remove("estimated");
  media.generateDetail.textContent = "complete 100%";

  const status = await (
    await fetch(`${base}/v1/videos/${job.job_id}`, {
      headers: { authorization: `Bearer ${key}` },
    })
  ).json();

  for (const ref of status.artifacts || []) {
    const result = await fetchArtifact(base + ref.url_path, key, {
      onProgress: trackTransfer(""),
    });
    preview(result.bytes, result.mime, `${ref.artifact_id.slice(0, 8)}… ${kb(result.received)}`);
  }

  const ms = Math.round(performance.now() - started);
  write("ok", `video ready and downloaded in ${ms} ms`, pretty(JSON.stringify(status)));
}

// Fetch one artifact by id, optionally proving that a dropped transfer resumes
// rather than starting over.
async function renderDirectFetch({ base, key, values, started }) {
  const url = `${base}/v1/artifacts/${encodeURIComponent(values.artifact_id)}/content`;

  if (!values.simulate_a_dropped_transfer) {
    const result = await fetchArtifact(url, key, { onProgress: trackTransfer("") });
    preview(result.bytes, result.mime, `${kb(result.received)}`);
    const ms = Math.round(performance.now() - started);
    write("ok", `downloaded ${kb(result.received)} in ${ms} ms`, `HTTP ${result.status}`);
    return;
  }

  // Abort partway, then ask for the rest. The two halves are rejoined and the
  // total compared, because a resumed transfer that quietly loses bytes would
  // look like a success.
  const controller = new AbortController();
  const track = trackTransfer("first attempt: ");
  let head = null;
  try {
    await fetchArtifact(url, key, {
      signal: controller.signal,
      onProgress: (received, total) => {
        track(received, total);
        head = { received, total };
        if (total && received >= total / 2) controller.abort();
      },
    });
  } catch (error) {
    if (error.name !== "AbortError") throw error;
  }

  if (!head) {
    write("warn", "nothing to resume", "The transfer finished before it could be interrupted.");
    return;
  }

  const tail = await fetchArtifact(url, key, {
    range: `bytes=${head.received}-`,
    onProgress: trackTransfer("resumed: "),
  });

  const rejoined = head.received + tail.received;
  const ok = rejoined === head.total;
  const ms = Math.round(performance.now() - started);
  write(
    ok ? "ok" : "err",
    ok
      ? `resumed transfer reassembled exactly (${kb(rejoined)} in ${ms} ms)`
      : `resumed transfer lost bytes: ${rejoined} of ${head.total}`,
    [
      `aborted after   ${head.received} of ${head.total} bytes`,
      `resume request  Range: bytes=${head.received}-`,
      `resume response HTTP ${tail.status}  ${tail.contentRange || ""}`,
      `rejoined        ${rejoined} bytes`,
    ].join("\n")
  );
}
