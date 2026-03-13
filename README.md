# AmanaFlow Automation Post Flow

Amanaflow ব্র্যান্ডের জন্য কাস্টম SaaS-style social automation UI।

## কি আছে
- নতুন **logo + favicon**
- modern dashboard UI (বাংলা + English toggle)
- post auto-generation panel (AI model + reply delay 2-10s)
- dedicated **Admin Panel** (`/admin.html`)
- 160+ configurable feature switches (Feature Lab)
- payment settings blocks: **SSLCommerz, bKash, Nagad**
- mock backend API stubs (`/backend/mock-server.js`)

## দ্রুত চালু করবেন

### Option 1: Python HTTP server
```bash
python -m http.server 4173
```
তারপর ব্রাউজারে খুলুন:
- http://127.0.0.1:4173/index.html
- http://127.0.0.1:4173/admin.html

### Option 2: Node mock API
```bash
node backend/mock-server.js
```
Default API server: `http://127.0.0.1:5050`

## গুরুত্বপূর্ণ নোট
- পেমেন্ট gateway live করতে production credentials দরকার (merchant key, app key, callback URL, signature validation)।
- এই version এ frontend + config + mock API প্রস্তুত।
- Postiz core source না থাকায় direct core patch করা যায়নি; এই repo এখন custom SaaS shell হিসেবে ready।
