require('dotenv').config();
const express = require('express');
const path    = require('path');
const { Pool } = require('pg');

const app  = express();
const PORT = process.env.PORT || 3000;
const GEMINI_MODEL = 'gemini-2.5-flash';

/*
  Routing Architecture Note:
  Express middleware (express.json) MUST be declared before the API routes.
  Failure to do so results in empty req.body payloads and silent database failures downstream.
*/
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json({ limit: '10mb' }));

// ─── DATABASE SETUP ───────────────────────────────────────────────
/*
  Infrastructure Note:
  Connecting to Railway's Postgres instance requires secure SSL.
  The rejectUnauthorized: false flag ensures the self-signed certs pass the Node.js TLS checks
  without blocking the connection.
*/
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

pool.query(`
  CREATE TABLE IF NOT EXISTS purchases (
    id VARCHAR(50) PRIMARY KEY,
    sync_code VARCHAR(50) NOT NULL,
    store VARCHAR(100),
    buyer VARCHAR(100),
    date TIMESTAMP,
    total NUMERIC(10, 2),
    items JSONB
  );
`).then(() => console.log("Cloud Database connected")).catch(console.error);

// ─── DATABASE API ROUTES ──────────────────────────────────────────
app.get('/api/bills', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM purchases WHERE sync_code = $1 ORDER BY date DESC LIMIT 60', [req.query.syncCode || 'default']);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/bills', async (req, res) => {
  try {
    const { syncCode, bill } = req.body;
    await pool.query(
      `INSERT INTO purchases (id, sync_code, store, buyer, date, total, items) 
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO UPDATE SET 
       sync_code = EXCLUDED.sync_code, store = EXCLUDED.store, buyer = EXCLUDED.buyer, 
       date = EXCLUDED.date, total = EXCLUDED.total, items = EXCLUDED.items`,
      [bill.id, syncCode || 'default', bill.store, bill.buyer, bill.date, bill.total, JSON.stringify(bill.items)]
    );
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/bills/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM purchases WHERE id = $1 AND sync_code = $2', [req.params.id, req.query.syncCode]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── ANTHROPIC → GEMINI TRANSLATOR ────────────────────────────────
/*
  Translation Layer Note:
  The frontend was originally built using Anthropic's Claude API schema.
  Instead of rewriting the entire frontend payload logic, this proxy translates 
  Anthropic-style requests into Gemini's v1beta REST format on the fly, 
  allowing seamless migration to Gemini 2.5 Flash for its higher token limits.
*/
function toGeminiRequest(anthropicBody) {
  const { system, messages, max_tokens } = anthropicBody;

  const contents = messages.map(msg => {
    const blocks = Array.isArray(msg.content) ? msg.content : [{ type: 'text', text: msg.content }];

    const parts = blocks.map(block => {
      if (block.type === 'text') return { text: block.text };
      if (block.type === 'image') {
        const cleanBase64 = block.source.data.replace(/^data:image\/\w+;base64,/, '');
        return { inlineData: { mimeType: block.source.media_type, data: cleanBase64 } };
      }
      return { text: '' };
    });

    return { role: msg.role === 'assistant' ? 'model' : 'user', parts };
  });

  const geminiReq = {
    contents,
    generationConfig: { maxOutputTokens: max_tokens || 1024, temperature: 0.2 },
  };

  if (system) geminiReq.systemInstruction = { parts: [{ text: system }] };
  
  return geminiReq;
}

function toAnthropicResponse(geminiData) {
  const candidate = (geminiData.candidates || [])[0];

  if (!candidate || !candidate.content) {
    const reason = candidate?.finishReason || 'UNKNOWN';
    return { error: { message: `Gemini returned no content (reason: ${reason}). Try a clearer image.` } };
  }

  const parts = candidate.content.parts || [];
  const text  = parts.map(p => p.text || '').join('');

  return {
    content: [{ type: 'text', text }],
    model:   GEMINI_MODEL,
    role:    'assistant',
  };
}

// ─── AI PROXY & LOAD BALANCER ─────────────────────────────────────
/*
  API Sharding / Round-Robin Requesting:
  To bypass strict Rate Limits (429 Quota errors) during heavy use or parallel fetching
  (e.g., verifying a 50+ item cart using concurrent requests), the server maintains a pool of multiple API keys.
  Each incoming request shifts to the next available key in the array to distribute the load.
*/
const API_KEYS = [
  process.env.GEMINI_API_KEY,
  process.env.GEMINI_API_KEY_2,
  process.env.GEMINI_API_KEY_3
].filter(Boolean); 

let keyIndex = 0;

app.post('/api/gemini', async (req, res) => {
  if (API_KEYS.length === 0) {
    return res.status(500).json({ error: { message: 'No GEMINI_API_KEYs set on server.' } });
  }

  const KEY = API_KEYS[keyIndex];
  keyIndex = (keyIndex + 1) % API_KEYS.length;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${KEY}`;

  try {
    const geminiBody = toGeminiRequest(req.body);

    const response = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(geminiBody),
    });

    const geminiData = await response.json();

    if (!response.ok) {
      const msg = geminiData?.error?.message || `Gemini API error (${response.status})`;
      console.error('Gemini error:', msg);
      return res.status(response.status).json({ error: { message: msg } });
    }

    const finishReason = geminiData?.candidates?.[0]?.finishReason;
    if (finishReason && finishReason !== 'STOP') {
      console.warn('Gemini finishReason:', finishReason);
    }

    const result = toAnthropicResponse(geminiData);

    if (result.error) return res.status(200).json(result);

    res.json(result);

  } catch (err) {
    console.error('Proxy error:', err.message);
    res.status(502).json({ error: { message: 'Proxy could not reach Gemini: ' + err.message } });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Slate app running on http://localhost:${PORT}`);
});
