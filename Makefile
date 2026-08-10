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

.PHONY: help serve open check hooks remote

help:
	@echo "serve   static server on http://localhost:$(PORT)"
	@echo "open    same as serve, and opens a browser"
	@echo "check   confirm the service is reachable and CORS admits this origin"
	@echo "remote  point the console at a Cloud Run deployment (PROJECT=<gcp-project-id>)"
	@echo "hooks   install the git hook that refuses a direct push to main"
	@echo ""
	@echo "vars    PORT=$(PORT)  API=$(API)  KEY=$(KEY)"

# Git does not carry hooks through a clone, so this points git at the tracked
# .githooks directory. Run it once per clone.
hooks:
	@git config core.hooksPath .githooks
	@echo "core.hooksPath -> .githooks (direct pushes to main will be refused)"

# Point the console at a Cloud Run deployment instead of a local service.
#
# The base URL is resolved from the deployment rather than pasted, because a
# Cloud Run URL carries a generated hash that nobody remembers and that changes
# if the service is recreated.
#
# The key is deliberately NOT fetched into the URL. A deployed key spends real
# provider credits, and $(URL) puts what it is given into the shell history and
# then the browser's. The command to read it is printed instead; paste it into
# the page's own field, which keeps it in one place you can clear.
REGION ?= us-central1
SERVICE ?= ai-api-unified-http

remote:
	@test -n "$(PROJECT)" || (echo "set PROJECT=<gcp-project-id>" && exit 1)
	@api=$$(gcloud run services describe $(SERVICE) --project=$(PROJECT) --region=$(REGION) --format='value(status.url)' 2>/dev/null); \
	test -n "$$api" || (echo "no service '$(SERVICE)' in $(PROJECT)/$(REGION)" && exit 1); \
	echo ""; \
	echo "  read the key:  gcloud secrets versions access latest --secret=HTTP_API_KEYS --project=$(PROJECT)"; \
	echo "                 (the value is label:key — paste the part after the colon)"; \
	echo ""; \
	$(MAKE) --no-print-directory open API="$$api" KEY=paste-the-key-above

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
	@curl -sf $(API)/health > /dev/null \
		|| (echo "service not reachable at $(API) — run 'make serve' in the service repo, or check the URL" && exit 1)
	@echo "service:  $$(curl -s $(API)/health)"
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
