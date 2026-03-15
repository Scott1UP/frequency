import { useCallback, useEffect, useRef, useState } from 'react';
import { setMicEnabled } from '../lib/audio';

interface UsePTTOptions {
  localStream: MediaStream | null;
  connected: boolean;
}

export function usePTT({ localStream, connected }: UsePTTOptions) {
  const [transmitting, setTransmitting] = useState(false);
  const transmittingRef = useRef(false);

  const startTalking = useCallback(() => {
    if (!localStream || !connected || transmittingRef.current) return;
    transmittingRef.current = true;
    setTransmitting(true);
    setMicEnabled(localStream, true);
  }, [localStream, connected]);

  const stopTalking = useCallback(() => {
    if (!transmittingRef.current) return;
    transmittingRef.current = false;
    setTransmitting(false);
    if (localStream) {
      setMicEnabled(localStream, false);
    }
  }, [localStream]);

  // Keyboard: spacebar
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.code === 'Space') {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        e.preventDefault();
        startTalking();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        stopTalking();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [startTalking, stopTalking]);

  // Window blur — release PTT
  useEffect(() => {
    const onBlur = () => stopTalking();
    window.addEventListener('blur', onBlur);
    return () => window.removeEventListener('blur', onBlur);
  }, [stopTalking]);

  return {
    transmitting,
    startTalking,
    stopTalking,
  };
}
