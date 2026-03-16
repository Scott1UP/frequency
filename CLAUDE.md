# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Frequency — a privacy-first, browser-based, push-to-talk voice chat app. Users join ephemeral voice channels via shared passphrase. No accounts, no identity, no persistent state.

**Current status:** Step 1 complete (local PTT via BroadcastChannel between tabs). Steps 2-5 (signalling server, encryption, TURN, UI polish) are TODO.

## Commands

### Client (`apps/client/`)
```bash
npm install          # install deps
npm run dev          # Vite dev server at http://localhost:5173
npm run build        # production build to dist/
npm run preview      # preview production build
```

### Server (`apps/server/`)
```bash
npm install          # install deps
npm run dev          # watch mode via tsx
npm run build        # compile TS to dist/
npm start            # run compiled server
```

### Docker (full stack)
```bash
docker-compose up --build   # server on :3001, coturn on :3478/:5349
```

## Architecture

**Monorepo** with two apps:
- `apps/client/` — Vite + React 18 + TypeScript SPA. Tailwind for styling.
- `apps/server/` — Node.js signalling server using raw `ws` library. No framework, no database, all state in-memory.
- `docker/` — coturn TURN server config and server Dockerfile.

**WebRTC full mesh** (max 10 peers). Audio is P2P via `RTCPeerConnection` — the server only brokers SDP/ICE exchange, never touches audio.

### Key client modules
- `src/hooks/useWebRTC.ts` — peer connection lifecycle, mic capture, remote audio playback
- `src/hooks/usePTT.ts` — PTT state machine (spacebar + mouse/touch), calls `setMicEnabled()` to gate mic
- `src/lib/audio.ts` — `acquireMicrophone()`, `setMicEnabled()`, squelch handling
- `src/components/PTTButton.tsx` — hold-to-talk UI

### Signalling (currently BroadcastChannel, will become WebSocket)
- Local testing uses `BroadcastChannel` (same-origin tabs only)
- Deterministic offer logic: if `myId < peerId`, make offer; else wait
- Message types defined in `apps/server/src/types.ts`

### Crypto flow (to be implemented)
- Passphrase → HKDF-SHA256 (salt: "frequency-v1", info: "room-id") → 32-byte hex room ID
- Signalling payloads encrypted with AES-256-GCM before transmission
- Audio encrypted via DTLS-SRTP (WebRTC spec, automatic)

## Design Constraints

- **Voice only** — no text, emoji, reactions, file sharing
- **No identity** — no accounts, usernames, or persistent user data
- **Ephemeral** — no history, recordings, or server state after room empties
- **Self-hostable** — `docker compose up` with zero external dependencies
- **Server must never:** log IPs, store passphrases/room IDs to disk, buffer audio, maintain state after room empties, require accounts, expose unauthenticated admin APIs

## Environment Variables (see `.env.example`)
- `TURN_SECRET` — HMAC secret for ephemeral TURN credentials
- `PORT` — signalling server port (default 3001)
- `VITE_SIGNALLING_URL` — WebSocket URL for signalling
- `VITE_TURN_URL` — TURN server URL
