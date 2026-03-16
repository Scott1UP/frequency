import type { WebSocket } from 'ws';

const MAX_PEERS = 10;

interface Peer {
  ws: WebSocket;
  roomId: string;
}

// peerId → Peer
const peers = new Map<string, Peer>();

// roomId → Set<peerId>
const rooms = new Map<string, Set<string>>();

export function joinRoom(
  roomId: string,
  peerId: string,
  ws: WebSocket,
): { success: true; existingPeers: string[] } | { success: false; error: 'room-full' } {
  const room = rooms.get(roomId) ?? new Set<string>();

  if (room.size >= MAX_PEERS) {
    return { success: false, error: 'room-full' };
  }

  room.add(peerId);
  rooms.set(roomId, room);
  peers.set(peerId, { ws, roomId });

  const existingPeers = [...room].filter((id) => id !== peerId);
  return { success: true, existingPeers };
}

export function leaveRoom(peerId: string): { roomId: string; remainingPeers: string[] } | null {
  const peer = peers.get(peerId);
  if (!peer) return null;

  const { roomId } = peer;
  peers.delete(peerId);

  const room = rooms.get(roomId);
  if (!room) return null;

  room.delete(peerId);

  if (room.size === 0) {
    rooms.delete(roomId);
    return { roomId, remainingPeers: [] };
  }

  return { roomId, remainingPeers: [...room] };
}

export function getPeerWs(peerId: string): WebSocket | undefined {
  return peers.get(peerId)?.ws;
}

export function getRoomPeers(roomId: string): Set<string> {
  return rooms.get(roomId) ?? new Set();
}

export function getPeerRoom(peerId: string): string | undefined {
  return peers.get(peerId)?.roomId;
}
