# Local harness for the ai-api-unified-http browser console.
# `make help` lists targets. Static files only — no build step.

PORT ?= 3000

# Where the service is, and the key to send. Defaults match the service's
# `make serve`; override for a service on another port or with a real key.
API ?= http://localhost:8080
KEY ?= local-dev-key

# The page reads both from the query string and leaves them editable, so this
# is a convenience rather than configuration baked into the page.
URL = http://localhost:$(PORT)/?base=$(API)&key=$(KEY)

.PHONY: help serve open check hooks

help:
	@echo "serve   static server on http://localhost:$(PORT)"
	@echo "open    same as serve, and opens a browser"
	@echo "check   confirm the service is reachable and CORS admits this origin"
	@echo "hooks   install the git hook that refuses a direct push to main"
	@echo ""
	@echo "vars    PORT=$(PORT)  API=$(API)  KEY=$(KEY)"

# Git does not carry hooks through a clone, so this points git at the tracked
# .githooks directory. Run it once per clone.
hooks:
	@git config core.hooksPath .githooks
	@echo "core.hooksPath -> .githooks (direct pushes to main will be refused)"

serve:
	@echo ""
	@echo "  ── browser console ────────────────────────────────────────"
	@echo "  open:     $(URL)"
	@echo "  service:  $(API)"
	@echo "  Ctrl-C stops."
	@echo ""
	@cd src && python3 -m http.server $(PORT)

open:
	@( sleep 1; open "$(URL)" 2>/dev/null || xdg-open "$(URL)" 2>/dev/null || true ) &
	@$(MAKE) serve

# The two failures worth catching before blaming the page: the service is not
# running, or it will not admit this origin.
check:
	@curl -sf $(API)/healthz > /dev/null \
		|| (echo "service not reachable at $(API) — run 'make serve' in the service repo" && exit 1)
	@echo "service:  $$(curl -s $(API)/healthz)"
	@printf "cors:     "
	@curl -s -o /dev/null -D - -X OPTIONS $(API)/v1/completions \
		-H "Origin: http://localhost:$(PORT)" \
		-H "Access-Control-Request-Method: POST" \
		-H "Access-Control-Request-Headers: authorization,content-type" \
		| grep -qi "access-control-allow-origin" \
		&& echo "http://localhost:$(PORT) is allowed" \
		|| echo "NOT allowed — set HTTP_CORS_ORIGINS on the service to include http://localhost:$(PORT)"
	@printf "auth:     "
	@test "$$(curl -s -o /dev/null -w '%{http_code}' -X POST $(API)/v1/tokens/count \
		-H 'content-type: application/json' -d '{"engine":"claude","prompt":"x"}')" = "401" \
		&& echo "gated (401 without a key, as expected)" \
		|| echo "NOT gated — the service is running without authentication"
