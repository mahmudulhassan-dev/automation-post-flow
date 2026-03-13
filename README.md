# AmanaFlow Owned Automation Platform

এটা এখন আপনার **নিজস্ব system codebase** — শুধু UI না, billing + payment + channel + admin feature control সহ Docker stack।

## Stack
- `web/` : frontend (user + admin panel)
- `api/` : backend API (pricing, channels, payment session, billing activation)
- `worker/` : auto-renew background job
- `docker-compose.yml` : db + redis + api + worker + web

## Core capabilities (current)
- Branding: custom logo + favicon + Bangla-first UI
- Channel integration records: user-wise channel connect/list
- Pricing পরিকল্পনা + payment session API
- Gateways: SSLCommerz / bKash / Nagad config structure
- Billing lifecycle: subscription create, activate, cancel, list
- Auto-renew worker: due renewal invoice issue/simulate charge
- Admin panel: API auth token + 160+ feature toggle + settings store

## Quick start
1. `copy .env.example .env`
2. `.env` এ password/token দিন
3. `docker compose up -d --build`
4. Web: `http://127.0.0.1:8088`
5. Admin page এ API URL + admin token দিয়ে connect করুন

## Demo endpoints
- `GET /api/health`
- `GET /api/plans`
- `POST /api/channels`
- `POST /api/payments/session`
- `POST /api/billing/activate`
- `GET /api/admin/features` (admin token required)

## Documents
- `docs/docker-setup-bn.md`
- `docs/customization-bn.md`
- `docs/deployment-bn.md`
- `docs/upstream-sync-postiz-bn.md`

## Upstream update strategy
Postiz-এর update আর direct code replace না করে controlled intake:
- `scripts/check-postiz-upstream.ps1` দিয়ে latest release note pull
- দরকারি feature নিজ architecture এ integrate

---
এই repo এখন **Automation Post Flow** নামে fully ownable foundation; production hardening (auth JWT/RBAC, real payment callbacks, OAuth connectors, observability) next phase হিসেবে planned।
