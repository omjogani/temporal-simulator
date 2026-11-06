# Temporal Chaos Simulator
.PHONY: up down reset-temporal backend frontend dev build check

up: ## Start Temporal and the 4 worker containers (Docker); gRPC :17233, Web UI :18233
	docker compose up -d --build

down: ## Stop Temporal, Postgres and the workers (keeps the Postgres volume)
	docker compose down

reset-temporal: ## Stop everything and wipe Temporal history (Postgres volume)
	docker compose down -v

backend: ## Run the Go controller on :18080 (it starts/kills the worker containers)
	cd backend && go build -o bin/sim ./cmd/sim && ./bin/sim controller

frontend: ## Run the Next.js app on :13000
	cd frontend && pnpm install && pnpm dev

dev: up ## Temporal + controller + frontend; Ctrl-C stops the app processes
	@cd frontend && pnpm install --silent
	@cd backend && go build -o bin/sim ./cmd/sim
	@trap 'kill 0' INT TERM; \
	  (cd backend && ./bin/sim controller) & \
	  (cd frontend && pnpm dev) & \
	  wait

build: ## Production build of both apps
	cd backend && go build -o bin/sim ./cmd/sim
	cd frontend && pnpm install && pnpm build

check: ## Vet, lint and build everything
	cd backend && gofmt -l . && go vet ./... && go build ./...
	cd frontend && pnpm lint && pnpm build
