import { useCallback, useEffect, useRef, useState } from 'react';

// Mirror of server types — kept local to avoid cross-package imports
type ServerMessage =
  | { type: 'joined'; peerId: string; peerCount: number; existingPeers: string[] }
  | { type: 'peer-joined'; peerId: string }
  | { type: 'peer-left'; peerId: string }
  | { type: 'offer'; fromId: string; payload: string }
  | { type: 'answer'; fromId: string; payload: string }
  | { type: 'ice'; fromId: string; payload: string }
  | { type: 'ptt-active'; peerId: string }
  | { type: 'ptt-inactive'; peerId: string }
  | { type: 'error'; code: string };

export interface SignallingCallbacks {
  onJoined: (myPeerId: string, existingPeers: string[]) => void;
  onPeerJoined: (peerId: string) => void;
  onPeerLeft: (peerId: string) => void;
  onOffer: (fromId: string, payload: string) => void;
  onAnswer: (fromId: string, payload: string) => void;
  onIce: (fromId: string, payload: string) => void;
  onPttActive: (peerId: string) => void;
  onPttInactive: (peerId: string) => void;
}

export function useSignalling(roomId: string | null, callbacks: SignallingCallbacks) {
  const [myPeerId, setMyPeerId] = useState<string | null>(null);
  const [peerCount, setPeerCount] = useState(0);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const cbRef = useRef(callbacks);
  cbRef.current = callbacks;

  useEffect(() => {
    if (!roomId) return;

    const url = import.meta.env.VITE_SIGNALLING_URL || 'ws://localhost:3001';
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'join', roomId }));
    };

    ws.onmessage = (e) => {
      const msg: ServerMessage = JSON.parse(e.data as string);

      switch (msg.type) {
        case 'joined':
          setMyPeerId(msg.peerId);
          setPeerCount(msg.peerCount);
          setConnected(true);
          cbRef.current.onJoined(msg.peerId, msg.existingPeers);
          break;
        case 'peer-joined':
          setPeerCount((c) => c + 1);
          cbRef.current.onPeerJoined(msg.peerId);
          break;
        case 'peer-left':
          setPeerCount((c) => Math.max(1, c - 1));
          cbRef.current.onPeerLeft(msg.peerId);
          break;
        case 'offer':
          cbRef.current.onOffer(msg.fromId, msg.payload);
          break;
        case 'answer':
          cbRef.current.onAnswer(msg.fromId, msg.payload);
          break;
        case 'ice':
          cbRef.current.onIce(msg.fromId, msg.payload);
          break;
        case 'ptt-active':
          cbRef.current.onPttActive(msg.peerId);
          break;
        case 'ptt-inactive':
          cbRef.current.onPttInactive(msg.peerId);
          break;
        case 'error':
          setError(msg.code);
          break;
      }
    };

    ws.onclose = () => {
      setConnected(false);
    };

    ws.onerror = () => {
      setError('Connection to signalling server failed');
    };

    // Send leave on page unload so the server removes us immediately
    const onBeforeUnload = () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'leave' }));
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      // Send leave synchronously before close — this ensures the server
      // removes our peer before the next connection joins (StrictMode, refresh)
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'leave' }));
      }
      ws.close();
      wsRef.current = null;
      setConnected(false);
      setMyPeerId(null);
      setPeerCount(0);
    };
  }, [roomId]);

  const sendOffer = useCallback((targetId: string, payload: string) => {
    wsRef.current?.send(JSON.stringify({ type: 'offer', targetId, payload }));
  }, []);

  const sendAnswer = useCallback((targetId: string, payload: string) => {
    wsRef.current?.send(JSON.stringify({ type: 'answer', targetId, payload }));
  }, []);

  const sendIce = useCallback((targetId: string, payload: string) => {
    wsRef.current?.send(JSON.stringify({ type: 'ice', targetId, payload }));
  }, []);

  const sendPttStart = useCallback(() => {
    wsRef.current?.send(JSON.stringify({ type: 'ptt-start' }));
  }, []);

  const sendPttStop = useCallback(() => {
    wsRef.current?.send(JSON.stringify({ type: 'ptt-stop' }));
  }, []);

  return {
    myPeerId,
    peerCount,
    connected,
    error,
    sendOffer,
    sendAnswer,
    sendIce,
    sendPttStart,
    sendPttStop,
  };
}
