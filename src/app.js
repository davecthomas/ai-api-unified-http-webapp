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
const VERSION = "1.2.0";

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
    ],
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
    if (field.type === "select") {
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
    if (field.type === "checkbox") {
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

    const text = await response.text();
    const ms = Math.round(performance.now() - started);
    write(
      cssClass(response.status),
      `${active.method} ${path} → HTTP ${response.status} (${ms} ms)`,
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
