import { WebSocketServer, WebSocket } from 'ws';
import type { ClientMessage, ServerMessage } from './types.js';
import { joinRoom, leaveRoom, getPeerWs, getRoomPeers, getPeerRoom } from './rooms.js';

const PORT = parseInt(process.env.PORT || '3001', 10);
const HEARTBEAT_MS = 10_000;

const wss = new WebSocketServer({ port: PORT });

function send(ws: WebSocket, msg: ServerMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function broadcast(roomId: string, msg: ServerMessage, excludePeerId?: string): void {
  for (const peerId of getRoomPeers(roomId)) {
    if (peerId === excludePeerId) continue;
    const ws = getPeerWs(peerId);
    if (ws) send(ws, msg);
  }
}

// Ping/pong heartbeat to detect stale WebSockets quickly
const alive = new WeakSet<WebSocket>();

const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (!alive.has(ws)) {
      ws.terminate();
      continue;
    }
    alive.delete(ws);
    ws.ping();
  }
}, HEARTBEAT_MS);

wss.on('close', () => clearInterval(heartbeat));

wss.on('connection', (ws) => {
  alive.add(ws);
  ws.on('pong', () => alive.add(ws));

  const peerId = crypto.randomUUID().slice(0, 8); // Short IDs for readability
  let joined = false;
  console.log(`[ws] connected: ${peerId}`);

  ws.on('message', (raw) => {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    switch (msg.type) {
      case 'join': {
        if (joined) break;
        const result = joinRoom(msg.roomId, peerId, ws);
        if (!result.success) {
          send(ws, { type: 'error', code: 'room-full' });
          break;
        }
        joined = true;
        console.log(`[room] ${peerId} joined ${msg.roomId} (existing: [${result.existingPeers.map(p => p.slice(0, 8)).join(', ')}])`);
        send(ws, {
          type: 'joined',
          peerId,
          peerCount: result.existingPeers.length + 1,
          existingPeers: result.existingPeers,
          turnCredentials: { urls: [], username: '', credential: '' }, // Step 4
        });

        // Tell existing peers about the new peer
        broadcast(msg.roomId, { type: 'peer-joined', peerId }, peerId);
        break;
      }

      case 'leave': {
        handleLeave();
        break;
      }

      case 'offer':
      case 'answer':
      case 'ice': {
        if (!joined) break;
        const targetWs = getPeerWs(msg.targetId);
        if (msg.type !== 'ice') {
          console.log(`[signal] ${peerId} → ${msg.targetId.slice(0, 8)}: ${msg.type} (delivered: ${!!targetWs})`);
        }
        if (targetWs) {
          send(targetWs, { type: msg.type, fromId: peerId, payload: msg.payload });
        }
        break;
      }

      case 'ptt-start': {
        if (!joined) break;
        const roomId = getPeerRoom(peerId);
        if (roomId) broadcast(roomId, { type: 'ptt-active', peerId }, peerId);
        break;
      }

      case 'ptt-stop': {
        if (!joined) break;
        const roomId2 = getPeerRoom(peerId);
        if (roomId2) broadcast(roomId2, { type: 'ptt-inactive', peerId }, peerId);
        break;
      }
    }
  });

  function handleLeave(): void {
    if (!joined) return;
    joined = false;
    const result = leaveRoom(peerId);
    console.log(`[room] ${peerId} left (remaining: ${result?.remainingPeers.length ?? 0})`);
    if (result) {
      broadcast(result.roomId, { type: 'peer-left', peerId });
    }
  }

  ws.on('close', handleLeave);
  ws.on('error', handleLeave);
});

console.log(`Frequency signalling server listening on port ${PORT}`);
