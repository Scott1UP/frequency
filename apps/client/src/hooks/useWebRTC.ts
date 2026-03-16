import { useCallback, useMemo, useRef, useState } from 'react';
import { acquireMicrophone, setMicEnabled, releaseMicrophone } from '../lib/audio';
import { useSignalling, type SignallingCallbacks } from './useSignalling';

const TEST_ROOM_ID = 'test-room'; // Hardcoded for Step 2; replaced by crypto in Step 3

export function useWebRTC() {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [hasPeers, setHasPeers] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const remoteAudiosRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const myPeerIdRef = useRef<string | null>(null);

  // Keep a ref to signalling send functions so callbacks can use them
  const signalRef = useRef<ReturnType<typeof useSignalling>>(null!);

  function createPeerConnection(remotePeerId: string): RTCPeerConnection {
    const pc = new RTCPeerConnection();

    // Add local tracks
    const stream = streamRef.current;
    if (stream) {
      for (const track of stream.getTracks()) {
        pc.addTrack(track, stream);
      }
    }

    // Handle remote audio
    pc.ontrack = (e) => {
      let audio = remoteAudiosRef.current.get(remotePeerId);
      if (!audio) {
        audio = document.createElement('audio');
        audio.autoplay = true;
        document.body.appendChild(audio);
        remoteAudiosRef.current.set(remotePeerId, audio);
      }
      audio.srcObject = e.streams[0] ?? new MediaStream([e.track]);
      audio.play().catch(() => {});
    };

    // Forward ICE candidates
    pc.onicecandidate = (e) => {
      if (e.candidate) {
        signalRef.current.sendIce(remotePeerId, JSON.stringify(e.candidate.toJSON()));
      }
    };

    // Track connection state
    pc.onconnectionstatechange = () => {
      updateHasPeers();
    };

    peersRef.current.set(remotePeerId, pc);
    return pc;
  }

  function removePeerConnection(remotePeerId: string): void {
    const pc = peersRef.current.get(remotePeerId);
    if (pc) {
      pc.close();
      peersRef.current.delete(remotePeerId);
    }

    const audio = remoteAudiosRef.current.get(remotePeerId);
    if (audio) {
      audio.srcObject = null;
      audio.remove();
      remoteAudiosRef.current.delete(remotePeerId);
    }

    updateHasPeers();
  }

  function updateHasPeers(): void {
    let anyConnected = false;
    for (const pc of peersRef.current.values()) {
      if (pc.connectionState === 'connected' || pc.connectionState === 'connecting') {
        anyConnected = true;
        break;
      }
    }
    setHasPeers(anyConnected);
  }

  async function connectToPeer(myId: string, remotePeerId: string): Promise<void> {
    // Guard: don't create a duplicate PC if one already exists (e.g. from onOffer race)
    if (peersRef.current.has(remotePeerId)) return;

    const pc = createPeerConnection(remotePeerId);

    // Deterministic offer: lower ID makes the offer
    if (myId < remotePeerId) {
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        signalRef.current.sendOffer(
          remotePeerId,
          JSON.stringify(pc.localDescription),
        );
      } catch (err) {
        console.error('[WebRTC] offer error:', err);
      }
    }
  }

  const callbacks = useMemo<SignallingCallbacks>(
    () => ({
      onJoined: (myPeerId: string, existingPeers: string[]) => {
        myPeerIdRef.current = myPeerId;
        for (const remotePeerId of existingPeers) {
          connectToPeer(myPeerId, remotePeerId);
        }
      },

      onPeerJoined: async (remotePeerId: string) => {
        const myId = myPeerIdRef.current;
        if (!myId) return;
        connectToPeer(myId, remotePeerId);
      },

      onPeerLeft: (remotePeerId: string) => {
        removePeerConnection(remotePeerId);
      },

      onOffer: async (fromId: string, payload: string) => {
        let pc = peersRef.current.get(fromId);
        if (!pc) {
          pc = createPeerConnection(fromId);
        }

        try {
          const offer = JSON.parse(payload);
          await pc.setRemoteDescription(offer);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          signalRef.current.sendAnswer(fromId, JSON.stringify(pc.localDescription));
        } catch (err) {
          console.error('[WebRTC] answer error:', err);
        }
      },

      onAnswer: async (fromId: string, payload: string) => {
        const pc = peersRef.current.get(fromId);
        if (!pc) return;

        try {
          const answer = JSON.parse(payload);
          await pc.setRemoteDescription(answer);
        } catch (err) {
          console.error('[WebRTC] set answer error:', err);
        }
      },

      onIce: async (fromId: string, payload: string) => {
        const pc = peersRef.current.get(fromId);
        if (!pc) return;

        try {
          const candidate = JSON.parse(payload);
          await pc.addIceCandidate(candidate);
        } catch {
          // May arrive before remote description is set
        }
      },

      onPttActive: () => {
        // Step 5 will wire this to UI indicators
      },

      onPttInactive: () => {
        // Step 5 will wire this to UI indicators
      },
    }),
    [], // Stable — uses refs internally
  );

  const signalling = useSignalling(roomId, callbacks);
  signalRef.current = signalling;

  const initialize = useCallback(async () => {
    if (streamRef.current) return;

    try {
      const stream = await acquireMicrophone();
      setMicEnabled(stream, false);
      streamRef.current = stream;
      setLocalStream(stream);
      setRoomId(TEST_ROOM_ID);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to access microphone');
    }
  }, []);

  const cleanup = useCallback(() => {
    // Close all peer connections
    for (const peerId of [...peersRef.current.keys()]) {
      removePeerConnection(peerId);
    }

    // Release mic
    const stream = streamRef.current;
    if (stream) {
      releaseMicrophone(stream);
      streamRef.current = null;
      setLocalStream(null);
    }

    setRoomId(null);
    setHasPeers(false);
  }, []);

  return {
    localStream,
    connected: hasPeers,
    roomConnected: signalling.connected,
    peerCount: signalling.peerCount,
    error: error || signalling.error,
    initialize,
    cleanup,
    sendPttStart: signalling.sendPttStart,
    sendPttStop: signalling.sendPttStop,
  };
}
