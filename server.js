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
const HARDCODED_GEMINI_KEY = '';

const effectiveGeminiKey = HARDCODED_GEMINI_KEY || process.env.GEMINI_API_KEY;
const genAI = effectiveGeminiKey ? new GoogleGenerativeAI(effectiveGeminiKey) : null;

function systemPrompt(diagramType) {
  const examples = {
    flowchart: `You convert natural language descriptions into valid Mermaid flowcharts. Output ONLY Mermaid code. No backticks, no explanations.
Use the format:
flowchart TD
A[Start] --> B{Check}
B -- Yes --> C[Do X]
B -- No --> D[Do Y]
C --> E[End]
D --> E[End]
` ,
    sequence: `You convert natural language descriptions into valid Mermaid sequence diagrams. Output ONLY Mermaid code. No backticks, no explanations.
Use the format:
sequenceDiagram
participant U as User
participant S as System
U->>S: Ask
S-->>U: Answer
`
  };
  return examples[diagramType] || examples.flowchart;
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
    const modelName = requestedModel || process.env.GEMINI_MODEL || 'gemini-2.5-pro';
    const model = genAI.getGenerativeModel({ model: modelName, systemInstruction: sys });
    const resp = await model.generateContent(user);
    const resultText = (resp && resp.response && resp.response.text && resp.response.text()) || '';

    const cleaned = (resultText || '').replace(/^```[a-zA-Z]*\n?|```$/g, '').trim();
    return res.json({ code: cleaned });
  } catch (err) {
    console.error('LLM error:', err);
    res.status(500).json({ error: 'Generation failed', detail: err?.message || String(err) });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`LLM server running on http://localhost:${PORT}`);
});


