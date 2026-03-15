import { useCallback, useRef, useState } from 'react';
import { acquireMicrophone, setMicEnabled, releaseMicrophone } from '../lib/audio';

interface SDP {
  type: RTCSdpType;
  sdp: string;
}

type SignalMessage =
  | { type: 'hello'; peerId: string }
  | { type: 'offer'; peerId: string; sdp: SDP }
  | { type: 'answer'; peerId: string; sdp: SDP }
  | { type: 'ice'; peerId: string; candidate: RTCIceCandidateInit };

const CHANNEL_NAME = 'frequency-local-signal';

function serializeDesc(desc: RTCSessionDescription): SDP {
  return { type: desc.type, sdp: desc.sdp };
}

export function useWebRTC() {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const peerIdRef = useRef(crypto.randomUUID());
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const initRef = useRef(false);
  const makingOfferRef = useRef(false);
  const helloIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const send = useCallback((msg: SignalMessage) => {
    channelRef.current?.postMessage(msg);
  }, []);

  const initialize = useCallback(async () => {
    if (initRef.current) return;
    initRef.current = true;

    try {
      const stream = await acquireMicrophone();
      setMicEnabled(stream, false);
      streamRef.current = stream;
      setLocalStream(stream);

      const myId = peerIdRef.current;

      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      for (const track of stream.getTracks()) {
        pc.addTrack(track, stream);
      }

      pc.ontrack = (e) => {
        if (!remoteAudioRef.current) {
          remoteAudioRef.current = document.createElement('audio');
          remoteAudioRef.current.autoplay = true;
          document.body.appendChild(remoteAudioRef.current);
        }
        remoteAudioRef.current.srcObject = e.streams[0];
      };

      pc.onicecandidate = (e) => {
        if (e.candidate) {
          send({ type: 'ice', peerId: myId, candidate: e.candidate.toJSON() });
        }
      };

      pc.onconnectionstatechange = () => {
        const state = pc.connectionState;
        if (state === 'connected') {
          setConnected(true);
          if (helloIntervalRef.current) {
            clearInterval(helloIntervalRef.current);
            helloIntervalRef.current = null;
          }
        } else if (state === 'disconnected' || state === 'failed') {
          setConnected(false);
        }
      };

      const channel = new BroadcastChannel(CHANNEL_NAME);
      channelRef.current = channel;

      channel.onmessage = async (e: MessageEvent<SignalMessage>) => {
        const msg = e.data;
        if (msg.peerId === myId) return;

        try {
          if (msg.type === 'hello') {
            if (pc.connectionState === 'connected' || pc.connectionState === 'connecting')
              return;
            if (pc.signalingState !== 'stable') return;

            if (myId < msg.peerId) {
              if (makingOfferRef.current) return;
              makingOfferRef.current = true;
              try {
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                send({
                  type: 'offer',
                  peerId: myId,
                  sdp: serializeDesc(pc.localDescription!),
                });
              } finally {
                makingOfferRef.current = false;
              }
            } else {
              send({ type: 'hello', peerId: myId });
            }
          }

          if (msg.type === 'offer') {
            if (pc.connectionState === 'connected' || pc.connectionState === 'connecting')
              return;
            await pc.setRemoteDescription(msg.sdp);
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            send({
              type: 'answer',
              peerId: myId,
              sdp: serializeDesc(pc.localDescription!),
            });
          }

          if (msg.type === 'answer') {
            if (pc.signalingState !== 'have-local-offer') return;
            await pc.setRemoteDescription(msg.sdp);
          }

          if (msg.type === 'ice') {
            try {
              await pc.addIceCandidate(msg.candidate);
            } catch {
              // May arrive before remote description
            }
          }
        } catch (err) {
          console.error('[WebRTC] signalling error:', err);
        }
      };

      send({ type: 'hello', peerId: myId });

      helloIntervalRef.current = setInterval(() => {
        if (
          pc.connectionState === 'connected' ||
          pc.connectionState === 'connecting'
        ) {
          clearInterval(helloIntervalRef.current!);
          helloIntervalRef.current = null;
          return;
        }
        if (makingOfferRef.current || pc.signalingState !== 'stable') return;
        send({ type: 'hello', peerId: myId });
      }, 1000);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to access microphone',
      );
      initRef.current = false;
    }
  }, [send]);

  const cleanup = useCallback(() => {
    const stream = streamRef.current;
    if (stream) {
      releaseMicrophone(stream);
      streamRef.current = null;
      setLocalStream(null);
    }
    if (helloIntervalRef.current) {
      clearInterval(helloIntervalRef.current);
      helloIntervalRef.current = null;
    }
    pcRef.current?.close();
    pcRef.current = null;
    channelRef.current?.close();
    channelRef.current = null;
    if (remoteAudioRef.current) {
      remoteAudioRef.current.remove();
      remoteAudioRef.current = null;
    }
    setConnected(false);
    initRef.current = false;
  }, []);

  return { localStream, connected, error, initialize, cleanup };
}
