import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';

dotenv.config();

const app = express();
// Allow common localhost dev ports (5173-5176, 3000-3001) and 127.0.0.1
const allowedOrigins = new Set([
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
  'http://localhost:5176',
  'http://localhost:3000',
  'http://localhost:3001',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
  'http://127.0.0.1:5175',
  'http://127.0.0.1:5176',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001',
]);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true); // allow non-browser clients
    if (allowedOrigins.has(origin)) return callback(null, true);
    return callback(new Error('Not allowed by CORS: ' + origin));
  },
}));
app.use(express.json({ limit: '1mb' }));

// WARNING: Hardcoding keys in code is insecure. Use only for quick local demos.
// Replace the placeholder below with your actual key OR use env GEMINI_API_KEY.
// NOTE: Leave empty before committing to GitHub.
const HARDCODED_GEMINI_KEY = 'AIzaSyDRhUyzABZ_ULXUGMpDodrEFXDITeofF7I';

const effectiveGeminiKey = process.env.GEMINI_API_KEY || HARDCODED_GEMINI_KEY;
const genAI = effectiveGeminiKey ? new GoogleGenerativeAI(effectiveGeminiKey) : null;

function systemPrompt(diagramType) {
  const prompts = {
    flowchart: `Task: Convert a plain English project/process description into a VALID Mermaid flowchart. Output ONLY Mermaid code (no backticks, no extra text).

Requirements:
- Start with: flowchart TD
- Extract clear steps and decision points from the description. Do not require user-provided arrows.
- Use rectangles for actions and diamonds for decisions with labeled branches (e.g., Yes/No).
- Create simple, readable node labels (Title Case). Use stable IDs (n1, n2, n3...).
- Prefer a single start and end if the description implies them.
- Keep it concise (5–12 nodes unless description is very long).
- Absolutely no commentary, backticks, or markdown.

Example style:
flowchart TD
  n1([Start]) --> n2[Collect Requirements]
  n2 --> n3{Requirements Clear?}
  n3 -- Yes --> n4[Design Architecture]
  n3 -- No --> n2
  n4 --> n5[Implement Features]
  n5 --> n6[Test & QA]
  n6 --> n7([End])
`,
    sequence: `Task: Convert a plain English system description into a VALID Mermaid sequence diagram. Output ONLY Mermaid code (no backticks, no extra text).

Requirements:
- Start with: sequenceDiagram
- Declare obvious participants from the description (e.g., User, Frontend, Backend, DB, ExternalService).
- Turn the described flow into messages between participants with short, imperative labels.
- Keep 5–12 messages unless the description is very long.
- Absolutely no commentary, backticks, or markdown.

Example style:
sequenceDiagram
  participant U as User
  participant FE as Frontend
  participant BE as Backend
  participant DB as Database
  U->>FE: Submit request
  FE->>BE: Validate & forward
  BE->>DB: Read/Write data
  DB-->>BE: Result
  BE-->>FE: Response
  FE-->>U: Show outcome
`
  };
  return prompts[diagramType] || prompts.flowchart;
}

async function generateWithRetry({ modelName, systemInstruction, userPrompt, attempts = 3, baseDelayMs = 600 }) {
  const model = genAI.getGenerativeModel({ model: modelName, systemInstruction });
  let lastErr = null;
  for (let i = 0; i < attempts; i++) {
    try {
      const resp = await model.generateContent(userPrompt);
      const text = (resp && resp.response && resp.response.text && resp.response.text()) || '';
      return text;
    } catch (err) {
      lastErr = err;
      const status = err?.status || err?.statusCode;
      const isTransient = status === 429 || status === 503 || String(err?.message || '').toLowerCase().includes('fetch') || String(err?.message || '').toLowerCase().includes('overloaded');
      if (i < attempts - 1 && isTransient) {
        const delay = baseDelayMs * Math.pow(2, i) + Math.floor(Math.random() * 200);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      break;
    }
  }
  throw lastErr || new Error('Generation failed');
}

app.post('/api/generate', async (req, res) => {
  try {
    const { description, type } = req.body || {};
    if (!description || !type) {
      return res.status(400).json({ error: 'Missing description or type' });
    }
    const sys = systemPrompt(type);
    const user = `Diagram type: ${type}\nDescription:\n${description}`;

    if (!genAI) {
      return res.status(500).json({ error: 'Gemini key not configured. Set HARDCODED_GEMINI_KEY or GEMINI_API_KEY.' });
    }
    const requestedModel = (req.body && req.body.model) || '';
    const primaryModel = requestedModel || process.env.GEMINI_MODEL || 'gemini-2.5-pro';
    const fallbackModel = process.env.GEMINI_FALLBACK_MODEL || 'gemini-1.5-flash';

    let resultText = '';
    try {
      resultText = await generateWithRetry({ modelName: primaryModel, systemInstruction: sys, userPrompt: user, attempts: 3 });
    } catch (primaryErr) {
      const status = primaryErr?.status || primaryErr?.statusCode;
      const canFallback = status === 429 || status === 503 || String(primaryErr?.message || '').toLowerCase().includes('overloaded');
      if (canFallback && fallbackModel && fallbackModel !== primaryModel) {
        try {
          resultText = await generateWithRetry({ modelName: fallbackModel, systemInstruction: sys, userPrompt: user, attempts: 3 });
        } catch (fallbackErr) {
          console.error('LLM error (fallback failed):', fallbackErr);
          return res.status(503).json({ error: 'Provider overloaded. Please retry shortly.', detail: fallbackErr?.message || String(fallbackErr) });
        }
      } else {
        console.error('LLM error (no fallback):', primaryErr);
        const httpStatus = status && Number.isInteger(status) ? status : 500;
        return res.status(httpStatus).json({ error: 'Generation failed', detail: primaryErr?.message || String(primaryErr) });
      }
    }

    const cleaned = (resultText || '').replace(/^```[a-zA-Z]*\n?|```$/g, '').trim();
    return res.json({ code: cleaned });
  } catch (err) {
    console.error('LLM error:', err);
    res.status(500).json({ error: 'Generation failed', detail: err?.message || String(err) });
  }
});

// Simple chat refinement endpoint: accepts messages [{role: 'user'|'assistant'|'system', content: string}]
app.post('/api/chat', async (req, res) => {
  try {
    const { messages = [], model } = req.body || {};
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Missing messages' });
    }
    if (!genAI) {
      return res.status(500).json({ error: 'Gemini key not configured. Set HARDCODED_GEMINI_KEY or GEMINI_API_KEY.' });
    }

    const primaryModel = model || process.env.GEMINI_MODEL || 'gemini-2.5-pro';
    const fallbackModel = process.env.GEMINI_FALLBACK_MODEL || 'gemini-1.5-flash';

    // Compose a system instruction to steer refinements towards clear flowchart descriptions
    const systemInstruction = `You are FlowAI, a helpful assistant that refines user descriptions into clear, short, unambiguous requirements suitable for generating Mermaid diagrams. 

IMPORTANT: When the user asks to modify an existing diagram (like "add X after Y" or "insert Z between A and B"), you should:
1. Preserve the existing flow structure
2. Only add/modify the specific parts requested
3. Keep all other steps intact
4. Maintain the logical flow and connections

For example, if the current flow is "Start -> Validate -> Process -> Save -> End" and user says "add requirement phase after start", the result should be "Start -> Requirements -> Validate -> Process -> Save -> End".

Keep the language concise, actionable, and avoid code fences.`;
    const userPrompt = messages.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n');

    let resultText = '';
    try {
      resultText = await generateWithRetry({ modelName: primaryModel, systemInstruction, userPrompt, attempts: 3 });
    } catch (primaryErr) {
      const status = primaryErr?.status || primaryErr?.statusCode;
      const canFallback = status === 429 || status === 503 || String(primaryErr?.message || '').toLowerCase().includes('overloaded');
      if (canFallback && fallbackModel && fallbackModel !== primaryModel) {
        resultText = await generateWithRetry({ modelName: fallbackModel, systemInstruction, userPrompt, attempts: 3 });
      } else {
        throw primaryErr;
      }
    }

    const cleaned = (resultText || '').replace(/^```[a-zA-Z]*\n?|```$/g, '').trim();
    res.json({ message: cleaned });
  } catch (err) {
    console.error('Chat error:', err);
    res.status(500).json({ error: 'Chat failed', detail: err?.message || String(err) });
  }
});

// Streaming chat via Server-Sent Events
app.post('/api/chat-stream', async (req, res) => {
  try {
    const { messages = [], model } = req.body || {};
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Missing messages' });
    }
    if (!genAI) {
      return res.status(500).json({ error: 'Gemini key not configured. Set HARDCODED_GEMINI_KEY or GEMINI_API_KEY.' });
    }

    const primaryModel = model || process.env.GEMINI_MODEL || 'gemini-2.5-pro';
    const fallbackModel = process.env.GEMINI_FALLBACK_MODEL || 'gemini-1.5-flash';
    const systemInstruction = `You are a helpful assistant that refines user descriptions into clear, short, unambiguous requirements suitable for generating Mermaid diagrams. Keep the language concise, actionable, and avoid code fences.`;
    const userPrompt = messages.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n');

    // SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const send = (event, data) => {
      res.write(`event: ${event}\n`);
      res.write(`data: ${data}\n\n`);
    };

    async function streamModel(modelName) {
      const modelInst = genAI.getGenerativeModel({ model: modelName, systemInstruction });
      const stream = await modelInst.generateContentStream(userPrompt);
      for await (const chunk of stream.stream) {
        const text = chunk?.text?.() || '';
        if (text) send('chunk', JSON.stringify({ text }));
      }
      const aggregated = await stream.response;
      const finalText = aggregated?.text?.() || '';
      send('done', JSON.stringify({ text: finalText }));
    }

    try {
      await streamModel(primaryModel);
    } catch (primaryErr) {
      const status = primaryErr?.status || primaryErr?.statusCode;
      const canFallback = status === 429 || status === 503 || String(primaryErr?.message || '').toLowerCase().includes('overloaded');
      if (canFallback && fallbackModel && fallbackModel !== primaryModel) {
        try {
          await streamModel(fallbackModel);
        } catch (fallbackErr) {
          send('error', JSON.stringify({ message: fallbackErr?.message || String(fallbackErr) }));
        }
      } else {
        send('error', JSON.stringify({ message: primaryErr?.message || String(primaryErr) }));
      }
    }
  } catch (err) {
    // If headers not sent, send JSON; otherwise try SSE error
    if (!res.headersSent) {
      return res.status(500).json({ error: 'Chat failed', detail: err?.message || String(err) });
    }
    try {
      res.write(`event: error\n`);
      res.write(`data: ${JSON.stringify({ message: err?.message || String(err) })}\n\n`);
    } catch {}
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`LLM server running on http://localhost:${PORT}`);
});


