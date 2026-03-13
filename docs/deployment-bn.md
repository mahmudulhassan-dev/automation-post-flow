# Deployment Guide (বাংলা)

## 1) Static UI deploy
- Nginx/Cloudflare এর behind এ `index.html`, `admin.html`, `assets/` serve করুন
- Root domain: `post.amanaflow.com`

## 2) API deploy
- `backend/mock-server.js` production API না, এটি development stub
- production এ Express/Fastify service + DB + queue (Redis) যোগ করুন

## 3) Payment live checklist
1. SSLCommerz merchant onboarding সম্পন্ন করুন
2. bKash Tokenized Checkout key নিন
3. Nagad Merchant API access নিন
4. প্রত্যেক gateway এর callback URL whitelist করুন
5. signature যাচাই ছাড়া payment success accept করবেন না

## 4) Security checklist
- `.env` ছাড়া কোনো secret git এ রাখবেন না
- webhook route signature verify করুন
- admin panel এর জন্য JWT + RBAC enable করুন
- API rate limit configure করুন
