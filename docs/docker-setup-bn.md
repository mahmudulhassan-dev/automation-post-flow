# Docker Setup (বাংলা)

## 1) Environment
```bash
copy .env.example .env
```
`.env` এ strong password/token দিন।

## 2) রান করুন
```bash
docker compose up -d --build
```

## 3) URLs
- Web: `http://127.0.0.1:8088`
- API: `http://127.0.0.1:8080/api/health`

## 4) Admin login token
`.env` এর `ADMIN_TOKEN` value Admin page এ দিয়ে connect করবেন।

## 5) useful commands
```bash
docker compose logs -f api
docker compose logs -f worker
docker compose down
```
