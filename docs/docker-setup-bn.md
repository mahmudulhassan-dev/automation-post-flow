# Docker Setup Guide (Bangla-friendly)

## 1) Create environment file
```bash
copy .env.example .env
```
Set strong values for:
- `POSTGRES_PASSWORD`
- `ADMIN_TOKEN`

## 2) Start full stack
```bash
docker compose up -d --build
```

## 3) URLs
- Web: `http://127.0.0.1:8088`
- API health: `http://127.0.0.1:8080/api/health`

## 4) Admin token usage
Use `.env` -> `ADMIN_TOKEN` value in Admin panel request header (`x-admin-token`).

## 5) Useful commands
```bash
docker compose logs -f api
docker compose logs -f worker
docker compose ps
docker compose down
```
