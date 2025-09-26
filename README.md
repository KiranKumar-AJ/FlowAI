# FlowAI – Text → Diagram Chatbot

Turn natural language descriptions into Mermaid diagrams (flowchart/sequence) with a clean React UI and an AI backend.

## Features
- React UI: description input, diagram type selector, Preview/Code tabs
- Mermaid renderer with error handling
- Export SVG/PNG
- AI generation endpoint (`/api/generate`) – pluggable provider

## Stack
- Frontend: Vite + React (JavaScript), Mermaid
- Backend: Node + Express
- Model provider: Gemini or OpenAI (configure one)

## Local Setup
```bash
# install deps
npm install

# install backend SDK (pick one)
# OpenAI:
npm install openai
# Gemini:
npm install @google/generative-ai
```

### Configure API key (do not commit keys)
- Preferred: set environment variable in a new terminal
  - Windows PowerShell
    - OpenAI: `setx OPENAI_API_KEY "sk-..."`
    - Gemini: `setx GEMINI_API_KEY "AIza..."`
- Or for quick local demo only: set the hardcoded key in `server.js` (not recommended)

### Run
```bash
# start backend
npm run server

# start frontend (in another terminal)
npm run dev
```
Open the shown URL (e.g., http://localhost:5173).

## Usage
1. Type a plain description (e.g., "User uploads file, system validates, stores, confirms").
2. Choose diagram type (Flowchart/Sequence).
3. Click "Generate with AI" to get Mermaid. Use "Preview" or edit under "Code".
4. Export SVG/PNG.

## Switching provider
- Gemini (AI Studio keys)
  - In `server.js` import `@google/generative-ai`, set `HARDCODED_GEMINI_KEY` or `GEMINI_API_KEY`.
  - Default model is `gemini-1.5-pro-latest`. You can send `{ model: 'gemini-1.5-flash-latest' }` from the frontend.
- OpenAI
  - In `server.js` import `openai`, set `HARDCODED_OPENAI_KEY` or `OPENAI_API_KEY`.
  - Default model is `gpt-4o-mini`. You can send `{ model: 'gpt-4o' }` from the frontend.

## Security
- Never commit API keys. `.gitignore` ignores `.env*`.
- Hardcoded keys are only for local demos.

## License
MIT
