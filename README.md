# AmanaFlow Owned Automation Platform (Go Core)

This repository is now your **own platform codebase** with a fast Go backend/worker stack.
You do not need to develop business logic in HTML/CSS/JavaScript anymore.

## Stack
- `cmd/api` - Go API service (pricing, channels, billing, payment session, admin settings)
- `cmd/worker` - Go auto-renew worker
- `internal/db` - SQL schema + seed logic
- `web/` - optional web UI and admin panel
- `docker-compose.yml` - Postgres + Redis + Go API + Go worker + Nginx web

## Core capabilities
- Brand assets (logo + favicon)
- User/channel integration records
- Pricing plans and subscription lifecycle
- Payment session flow for SSLCommerz, bKash, Nagad
- Billing activation and cancellation
- Auto-renew invoice generation worker
- Admin summary, settings groups, and 160+ feature flags

## Quick start
1. `copy .env.example .env`
2. Set strong values in `.env`
3. `docker compose up -d --build`
4. Open web: `http://127.0.0.1:8088`
5. API health: `http://127.0.0.1:8080/api/health`

## API examples
- `GET /api/health`
- `GET /api/plans`
- `POST /api/channels`
- `POST /api/payments/session`
- `POST /api/billing/activate`
- `GET /api/admin/features` (requires `x-admin-token`)

## Upstream strategy (Postiz)
We do controlled intake, not direct replacement:
1. Pull latest release metadata using `scripts/check-postiz-upstream.ps1`
2. Select needed ideas/features
3. Implement in your own Go architecture

## Documents
- `docs/docker-setup-bn.md`
- `docs/customization-bn.md`
- `docs/deployment-bn.md`
- `docs/upstream-sync-postiz-bn.md`
