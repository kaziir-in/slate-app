# Slate App — AI-Powered Smart Shopping List

A full-stack, mobile-first grocery management application that uses Google's Gemini 2.5 Flash Vision AI to instantly scan products, automatically verify cart logic, and sync purchases across family devices in real-time.

## ✨ Core Features

* **AI Product Scanner:** Snap a photo of any item. The Vision AI extracts the generic product name, specific brand line, unit price, size/weight (formatted as `Name | Size`), and auto-categorizes it into one of 10 granular departments.
* **Smart Cart Verification:** An AI "Checkout Checker" that reads massive (50+ item) shopping lists to flag missing brand names or items placed in the wrong categories before saving.
* **Cloud Family Sync:** Instantly syncs lists across devices via a PostgreSQL database using a secure, stealth-loaded family passphrase.
* **Offline Portability:** Export your entire active cart as a lightweight `.json` file and import it on any other device without needing a cloud connection.
* **Modern PDF Receipts:** Generates beautiful, 2-column, alphabetized invoice PDFs directly in the browser using CSS styling.
* **Resilient UX:** Built-in error sanitization translates raw API timeouts and quota limits into friendly, actionable UI toast notifications.

---

## 🏗️ Technical Architecture & Key Findings

During development, several complex engineering challenges were solved using custom architectural patterns:

### 1. API Sharding (Load Balancing)
**The Problem:** Google's Gemini free tier enforces a strict 15 Requests-Per-Minute (HTTP 429) quota. Verifying massive carts or having multiple family members scanning items simultaneously caused the app to crash.
**The Solution:** The Node.js Express server acts as a proxy load-balancer. It holds an array of three separate `GEMINI_API_KEY`s and uses a Round-Robin rotation. Every incoming request is seamlessly handed to the next available key, effectively tripling the app's rate limit capability and preventing downtime.

### 2. The "Silent Approval" AI Prompt
**The Problem:** When asking the AI to verify a 50+ item cart, the AI would attempt to write a massive JSON array of all 50 perfectly fine items. This wasted tokens, spiked latency to 15+ seconds, and frequently caused the AI to truncate its response mid-sentence (`end of data` JSON parse errors).
**The Solution:** The AI prompt was rewritten using a "Silent Approval" protocol. The AI is strictly instructed to return *only* items that have errors. The frontend JavaScript dynamically infers that any item missing from the AI's "issue" list is automatically verified. This dropped AI output from 2,000+ characters down to a few lines, entirely eliminating truncation bugs.

### 3. HTML-to-PDF vs. jsPDF
**The Problem:** Traditional coordinate-math PDF libraries (`jsPDF`) struggled to format 50+ item receipts cleanly and frequently failed to trigger download prompts on desktop browsers.
**The Solution:** Migrated to `html2pdf.js`. The receipt is now structured using a hidden DOM element with standard CSS (`column-count: 2`). This allows dense lists to cleanly flow into two alphabetized columns, creating a professional retail-style manifest that downloads flawlessly on all devices.

### 4. "Stealth Sync" UI Pattern
**The Problem:** Auto-filling a secret cloud-sync passphrase into a visible text input creates a shoulder-surfing security risk.
**The Solution:** The app utilizes `localStorage` to hold the family passphrase. If the UI input is empty, the JavaScript stealth-loads the passphrase in the background payload. If a user manually types a code, the UI instantly clears the input box upon submission so the code never lingers on screen.

---

## 🛠️ Tech Stack

* **Frontend:** Vanilla JavaScript (ES6+), HTML5, CSS3 (CSS Variables, Flexbox/Grid).
* **Backend:** Node.js, Express.js.
* **Database:** PostgreSQL (Hosted via Railway).
* **AI Integration:** Google Gemini 2.5 Flash (via REST fetch).
* **Libraries:** `html2pdf.js` (for receipt generation), `pg` (Postgres driver), `dotenv` (Secrets management).

---

## 🚀 Local Development Setup

### Prerequisites
* Node.js (v18 or higher)
* PostgreSQL database URL
* Google Gemini API Keys (up to 3 for load balancing)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/kaziir-in/slate-app.git
   cd slate
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up Environment Variables**
   Copy the template file to create your local `.env`:
   ```bash
   cp .env.example .env
   ```
   Open `.env` and add your secure credentials. **Note:** Ensure your `DATABASE_URL` ends with `?sslmode=require`.

4. **Start the Development Server**
   ```bash
   npm run dev
   ```
   The app will automatically create the required database tables on boot. Visit `http://localhost:3000` in your browser.

---

## 🔒 Security Posture
* **Hidden API Keys:** The frontend never communicates with Google or Postgres directly. All requests pass through the Express proxy.
* **Environment Protection:** `.env` and `node_modules/` are strictly excluded via `.gitignore`.
* **Encrypted DB Connections:** Mandatory SSL requirements on the Postgres pooling logic.
```