# Frequency — project spec
### For implementation with Claude Code in Cursor

---

## Overview

Frequency is a privacy-first, browser-based, push-to-talk voice communication app modelled on the interaction paradigm of a physical walkie-talkie. Users join ephemeral voice channels using a shared passphrase — no accounts, no identity, no persistent state. When the session ends, everything is gone.

The project is intended to be fully self-hostable via a single Docker Compose command.

---

## Core principles

These are non-negotiable constraints that should inform every implementation decision:

- **Voice only.** No text chat, no emoji, no reactions, no file sharing.
- **No identity.** No accounts, no usernames, no phone numbers, no emails. Users are anonymous within a session.
- **Ephemeral by default.** No message history, no recordings, no server-side state beyond active session routing.
- **Self-hostable.** The entire stack runs locally or on a VPS with `docker compose up`. No external dependencies required.
- **Passphrase as the key.** The shared passphrase is the only credential. It never leaves the client in plaintext.

---

## Product behaviour

### Channel joining
- User lands on a single-page app with one input: a passphrase field.
- The passphrase is hashed client-side using HKDF (Web Crypto API) to derive a room ID.
- The room ID is sent to the signalling server to join or create a room.
- The passphrase itself never leaves the browser.
- Maximum 10 users per channel simultaneously. If a channel is full, the user is shown an error and cannot join.

### Push-to-talk
- The primary interaction is a single PTT button (or holdable key binding, e.g. spacebar).
- Holding PTT: activates the microphone and begins transmitting audio to all peers in the channel.
- Releasing PTT: stops transmitting. The channel returns to receive-only mode.
- Only one user can transmit at a time. If another user is transmitting, a visual indicator shows who "has the channel". Attempts to transmit while blocked are silently queued or dropped — do not interrupt.

### Channel state
- No channel persists after all users have left. The server discards the room.
- No rejoining a previous session — the passphrase produces a new room each time.
- No visible participant list beyond a simple count of active users in the channel (e.g. "3 on channel").

### Audio behaviour
- Audio codec: Opus via WebRTC (browser native).
- No audio is stored, buffered server-side, or logged at any point.
- Implement a subtle ambient "channel open" audio cue when PTT is activated (like a radio squelch click).

---

## Technical architecture

### Frontend

| Concern | Choice |
|---|---|
| Framework | React 18 + TypeScript |
| Build tool | Vite |
| Styling | Tailwind CSS |
| Voice | WebRTC via browser native APIs (`getUserMedia`, `RTCPeerConnection`) |
| Codec | Opus (default WebRTC audio codec, no configuration needed) |
| Crypto | Web Crypto API (`SubtleCrypto`) — built into all modern browsers |
| WebSocket client | Native browser WebSocket |

The frontend is a static build. There is no server-side rendering. Deploy the Vite build output behind any static file server or CDN.

### Signalling server

| Concern | Choice |
|---|---|
| Runtime | Node.js 20+ |
| Language | TypeScript |
| Framework | None — raw `ws` WebSocket library |
| Responsibility | WebRTC handshake brokering only (ICE candidates + SDP exchange) |

The signalling server brokers WebRTC peer connections. Once a connection is established between peers, the signalling server has no further role in the audio path. It holds no state beyond active room membership (in-memory only, no database).

The server must implement:
- Room join / leave events
- ICE candidate forwarding
- SDP offer / answer forwarding
- Room capacity enforcement (max 10 peers)
- Room cleanup when empty

The server must never:
- Log IP addresses
- Store room names, passphrases, or derived room IDs to disk
- Buffer or inspect audio

### WebRTC topology

Use a **full mesh** topology for small groups (up to 10 peers). Each peer establishes a direct `RTCPeerConnection` to every other peer in the room. This keeps audio P2P and avoids the complexity of a selective forwarding unit (SFU).

Mesh is appropriate here because:
- Max group size is 10
- Audio-only (video would strain mesh at this scale)
- No central media server required, preserving privacy

### TURN relay (coturn)

A self-hosted coturn TURN server is included as a fallback for peers that cannot establish a direct P2P connection (approximately 20–30% of real-world network conditions).

Configuration requirements:
- **No logging.** Disable all coturn logging in the config.
- **Ephemeral credentials.** Generate short-lived TURN credentials per session (HMAC-based, time-limited). Never use static credentials.
- **No relay to arbitrary IPs.** Restrict relay to peer-to-peer traffic only.

coturn runs as a Docker service alongside the signalling server. The frontend receives TURN credentials from the signalling server at session start.

### Encryption

| Layer | Mechanism |
|---|---|
| Audio | DTLS-SRTP (mandatory, enforced by WebRTC spec) |
| Signalling messages | Encrypted client-side using Web Crypto API before sending to server |
| Passphrase derivation | HKDF-SHA256 via `SubtleCrypto.deriveKey` |

**Passphrase → room ID derivation:**
```
passphrase → HKDF-SHA256(salt: "frequency-v1", info: "room-id") → 32-byte room ID → hex string
```

The signalling server sees only the hex room ID, never the passphrase. Signalling payloads (SDP, ICE candidates) are encrypted with a symmetric key also derived from the passphrase before transmission, so the signalling server forwards opaque blobs.

---

## Project structure

```
Frequency/
├── apps/
│   ├── client/                  # Vite + React frontend
│   │   ├── src/
│   │   │   ├── components/
│   │   │   │   ├── PTTButton.tsx
│   │   │   │   ├── ChannelStatus.tsx
│   │   │   │   ├── PassphraseEntry.tsx
│   │   │   │   └── AudioIndicator.tsx
│   │   │   ├── hooks/
│   │   │   │   ├── usePTT.ts           # PTT state, mic gating
│   │   │   │   ├── useWebRTC.ts        # Peer connection management
│   │   │   │   └── useSignalling.ts    # WebSocket signalling
│   │   │   ├── lib/
│   │   │   │   ├── crypto.ts           # HKDF derivation, payload encryption
│   │   │   │   └── audio.ts            # getUserMedia, squelch audio cues
│   │   │   ├── App.tsx
│   │   │   └── main.tsx
│   │   ├── index.html
│   │   ├── vite.config.ts
│   │   └── package.json
│   │
│   └── server/                  # Node.js signalling server
│       ├── src/
│       │   ├── server.ts           # WebSocket server entry point
│       │   ├── rooms.ts            # In-memory room state management
│       │   ├── turnCredentials.ts  # Ephemeral HMAC TURN credential generation
│       │   └── types.ts            # Shared message types
│       ├── tsconfig.json
│       └── package.json
│
├── docker/
│   ├── coturn.conf              # coturn configuration (no logging, relay only)
│   └── Dockerfile.server
│
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## WebSocket message protocol

All messages are JSON. Signalling payloads (SDP, ICE) are encrypted before sending.

```typescript
// Client → Server
type ClientMessage =
  | { type: 'join';      roomId: string }
  | { type: 'leave' }
  | { type: 'offer';     targetId: string; payload: string }  // encrypted SDP offer
  | { type: 'answer';    targetId: string; payload: string }  // encrypted SDP answer
  | { type: 'ice';       targetId: string; payload: string }  // encrypted ICE candidate
  | { type: 'ptt-start' }   // broadcast PTT state (no audio content)
  | { type: 'ptt-stop' }

// Server → Client
type ServerMessage =
  | { type: 'joined';    peerId: string; peerCount: number; turnCredentials: TurnCredentials }
  | { type: 'peer-joined'; peerId: string }
  | { type: 'peer-left';   peerId: string }
  | { type: 'offer';     fromId: string; payload: string }
  | { type: 'answer';    fromId: string; payload: string }
  | { type: 'ice';       fromId: string; payload: string }
  | { type: 'ptt-active'; peerId: string }
  | { type: 'ptt-inactive'; peerId: string }
  | { type: 'error';     code: 'room-full' | 'invalid-room' }
```

Peer IDs are random UUIDs generated server-side at join time. They are ephemeral and session-scoped only.

---

## Docker Compose

```yaml
# docker-compose.yml (reference — implement this exactly)
version: '3.9'
services:
  server:
    build:
      context: .
      dockerfile: docker/Dockerfile.server
    ports:
      - "3001:3001"
    environment:
      - TURN_SECRET=${TURN_SECRET}
      - PORT=3001
    restart: unless-stopped

  coturn:
    image: coturn/coturn:latest
    network_mode: host        # required for UDP relay to work correctly
    volumes:
      - ./docker/coturn.conf:/etc/coturn/turnserver.conf:ro
    environment:
      - TURN_SECRET=${TURN_SECRET}
    restart: unless-stopped
```

---

## Environment variables

```bash
# .env.example
TURN_SECRET=          # Random secret for HMAC TURN credential generation (generate with: openssl rand -hex 32)
PORT=3001             # Signalling server port
VITE_SIGNALLING_URL=  # WebSocket URL for client to connect to (e.g. ws://localhost:3001)
VITE_TURN_URL=        # TURN server URL (e.g. turn:yourdomain.com:3478)
```

---

## Implementation order

Implement strictly in this order. Do not build the UI until step 4.

**Step 1 — PTT voice between two browser tabs (local, no encryption)**
- Implement `getUserMedia` mic capture
- Implement `RTCPeerConnection` mesh between two peers
- Implement PTT gating: mic track enabled/disabled on button hold/release
- Hardcode the signalling for now (manual copy/paste of SDP is acceptable at this stage)
- Confirm two-way audio works with PTT before proceeding

**Step 2 — Signalling server**
- Implement the Node.js WebSocket server
- Implement in-memory room management
- Implement message forwarding (offer, answer, ICE)
- Implement room capacity limit
- Connect the client's `useSignalling` hook to replace the manual SDP step from step 1
- Test with two browser tabs on the same machine

**Step 3 — Passphrase derivation and signalling encryption**
- Implement HKDF room ID derivation in `crypto.ts`
- Implement symmetric encryption of signalling payloads using a key derived from the passphrase
- Verify the server forwards encrypted blobs without being able to read them
- Test that two clients with the same passphrase can connect; mismatched passphrases cannot

**Step 4 — coturn integration**
- Add coturn service to Docker Compose
- Implement ephemeral TURN credential generation on the server (`turnCredentials.ts`)
- Pass credentials to client on join
- Add TURN server to `RTCPeerConnection` ICE configuration
- Test connectivity under simulated NAT (or between two different machines / networks)

**Step 5 — UI**
- Build the PassphraseEntry screen
- Build the PTT button with hold state
- Build channel status indicators (peer count, who has PTT)
- Add squelch audio cue on PTT activate/deactivate
- Apply styling (see UI notes below)

---

## UI notes

The visual design should feel like a digital interpretation of a hardware walkie-talkie — utilitarian, high contrast, tactile. Not skeuomorphic, but clearly influenced by the physical object.

Key interaction requirements:
- The PTT button must be large, thumb-reachable, and have a clear held/active state
- Holding spacebar should trigger PTT (keyboard shortcut)
- A clear visual indicator when another peer is transmitting (prevent confusion about why PTT is blocked)
- Peer count shown as a simple number, not a list of names or identities
- No settings panel, no profile, no navigation — one screen only

The app should work on mobile browsers (touch events for PTT).

---

## What the server must never do

This list is a hard constraint. Raise a flag during implementation if any of these is architecturally required:

- Log or store IP addresses
- Store passphrases or room IDs to disk
- Buffer audio data
- Maintain any state after a room is empty
- Require user accounts or identity of any kind
- Expose any admin or management API without authentication

---

## Out of scope (for this version)

- Text messaging of any kind
- Screen sharing or video
- Recording or transcription
- Push notifications
- Mobile native app (iOS/Android)
- Federation or multi-server rooms
- Moderation or admin tools
- User profiles or persistent callsigns
- End-to-end encrypted group key agreement (Signal Protocol / Double Ratchet) — DTLS-SRTP is sufficient for v1
