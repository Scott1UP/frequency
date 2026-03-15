# Frequency

Privacy-first, browser-based, push-to-talk voice communication. Like a walkie-talkie — no accounts, no history, no trace.

## Quick Start (Step 1 — Local PTT)

```bash
cd apps/client
npm install
npm run dev
```

Open two browser tabs at `http://localhost:5173`. Grant microphone access in both. Hold the PTT button (or spacebar) in one tab to transmit voice to the other.

## Architecture

- `apps/client/` — Vite + React frontend
- `apps/server/` — Node.js WebSocket signalling server (Step 2+)
- `docker/` — coturn TURN server config (Step 4+)
# frequency
