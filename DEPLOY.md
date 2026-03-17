# Deploying slate.kaziir.in — Full Full-Stack Guide

## What's in this folder

```
slate-app/
├── public/
│   └── index.html     ← The frontend app (UI, HTML-to-PDF, logic, JSON Import/Export)
├── server.js          ← Node.js Express Server (API Sharding, DB Routing, Gemini Proxy)
├── package.json       ← Project dependencies (express, pg, dotenv)
├── .gitignore         ← Prevents secrets and node_modules from leaking to GitHub
└── .env.example       ← Template for your environment variables
```

---

## Step 1 — Get your Gemini API Keys (For Sharding)

To process massive 50+ item shopping carts rapidly without hitting Google's strict 15 Requests-Per-Minute quota, this app uses an **API Sharding / Round-Robin** strategy. You need 3 keys.

1. Go to [https://aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)
2. Sign in with your Google account.
3. Click **Create API Key**. Create 3 separate keys (e.g., "slate-key-1", "slate-key-2", "slate-key-3").
4. Copy them down immediately. They start with `AIza...`

---

## Step 2 — Provision your Cloud Database

The app uses PostgreSQL to sync shopping lists instantly across family devices.

1. Go to [https://railway.app](https://railway.app) and sign in.
2. Click **New Project** -> **Provision PostgreSQL**.
3. Once the database spins up, click on the **Postgres** block -> **Variables** tab.
4. Locate the `DATABASE_URL`. It will look like: `postgresql://postgres:password@host:port/railway`.
5. **CRITICAL:** When you copy this URL, you MUST append `?sslmode=require` to the very end of it, otherwise the secure connection will be rejected.

---

## Step 3 — Push to GitHub

```bash
# In your terminal, inside the slate-app folder:
cd slate-app
git init
git add .
git commit -m "initial full-stack slate app"

# Create a new repo on github.com (call it "slate" or anything)
# Then:
git remote add origin https://github.com/YOUR_USERNAME/slate.git
git branch -M main
git push -u origin main
```

---

## Step 4 — Deploy the Web Server on Railway

Railway will host both your Database and your Node.js backend.

1. In your Railway project (where you just made the Postgres DB), click **New** -> **GitHub Repo**.
2. Select your `slate` repository.
3. Railway auto-detects Node.js and starts building it. 
4. While it builds, click the new **Web Service** block -> **Variables** tab.
5. Add your four environment variables:
   - `GEMINI_API_KEY` = `AIza...` (Key 1)
   - `GEMINI_API_KEY_2` = `AIza...` (Key 2)
   - `GEMINI_API_KEY_3` = `AIza...` (Key 3)
   - `DATABASE_URL` = `${{Postgres.DATABASE_URL}}?sslmode=require` (Or paste your modified URL directly).
6. Railway will automatically redeploy with the keys securely injected.

---

## Step 5 — Connect your domain (slate.kaziir.in)

### On Railway:
1. In your Web Service block, go to **Settings → Domains**
2. Click **Add Custom Domain**
3. Type `slate.kaziir.in` and click Add
4. Railway shows you a CNAME value to add — copy it

### On your domain registrar (wherever kaziir.in is managed):
1. Log in to your DNS provider (Cloudflare, GoDaddy, Namecheap, etc.)
2. Add a **CNAME record**:
   - Name/Host: `slate`
   - Value/Target: the CNAME Railway gave you (looks like `xxx.railway.app`)
   - TTL: Auto or 300
3. Save

*Note for Cloudflare users: Set the proxy status to **DNS only** (grey cloud, not orange) for Railway to provision the SSL certificate properly.*

---

## Step 6 — Test everything

Open `slate.kaziir.in` on your phone and verify:
- [ ] **Scan Product:** Upload or snap an image — AI should extract "Name | Weight", Brand, Price, and 1 of 10 exact categories.
- [ ] **Check Cart:** The "Silent Approval" AI should verify a 50+ item cart in under 5 seconds.
- [ ] **Cloud Sync:** "Save Purchase" should write to Railway. Clicking "Load Cloud" with a blank sync box should stealth-load `siddiq-sajida-214`'s history.
- [ ] **Download Bill:** Clicking download should generate a clean, 2-column alphabetized PDF via standard browser downloads (no jsPDF crashes).
- [ ] **Offline Portability:** Try exporting a bill to a `.json` file and importing it back into a fresh cart.

---

## Local development (testing on your laptop)

```bash
cd slate-app
# Install the required server dependencies (Express, Postgres driver, and Dotenv)
npm install express pg dotenv

# Create your local .env file
cp .env.example .env

# Open .env and paste your 3 Gemini API keys and your Railway DATABASE_URL
# Make SURE your DATABASE_URL ends with ?sslmode=require

# Run the local development server
npm run dev
# → You should see "Cloud Database connected" and "App running on http://localhost:3000"
```

---

## Security Architecture Notes

- **The Git Shield:** `.env` and `node_modules/` are strictly ignored in `.gitignore`. Credentials never hit your public repository.
- **Stealth Sync:** The family sync code (`sxxxxq-sxxxxa-xxx`) is handled completely in the background JavaScript logic. The UI input box remains blank to prevent shoulder-surfing.
- **Frontend Barrier:** The browser never sees your API keys or Database passwords. The frontend exclusively talks to your `/api/bills` and `/api/gemini` endpoints, keeping secrets locked inside the Railway container.
- **Error Sanitization:** Raw developer errors (like JSON parsing fails or Quota limits) are intercepted by the `friendlyError()` utility and translated into clean, readable toast popups for the end user.