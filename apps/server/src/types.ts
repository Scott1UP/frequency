// Client → Server
export type ClientMessage =
  | { type: 'join'; roomId: string }
  | { type: 'leave' }
  | { type: 'offer'; targetId: string; payload: string }
  | { type: 'answer'; targetId: string; payload: string }
  | { type: 'ice'; targetId: string; payload: string }
  | { type: 'ptt-start' }
  | { type: 'ptt-stop' };

// Server → Client
export type ServerMessage =
  | { type: 'joined'; peerId: string; peerCount: number; existingPeers: string[]; turnCredentials: TurnCredentials }
  | { type: 'peer-joined'; peerId: string }
  | { type: 'peer-left'; peerId: string }
  | { type: 'offer'; fromId: string; payload: string }
  | { type: 'answer'; fromId: string; payload: string }
  | { type: 'ice'; fromId: string; payload: string }
  | { type: 'ptt-active'; peerId: string }
  | { type: 'ptt-inactive'; peerId: string }
  | { type: 'error'; code: 'room-full' | 'invalid-room' };

export interface TurnCredentials {
  urls: string[];
  username: string;
  credential: string;
}
