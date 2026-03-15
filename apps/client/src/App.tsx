import { useEffect } from 'react';
import { useWebRTC } from './hooks/useWebRTC';
import { usePTT } from './hooks/usePTT';
import PTTButton from './components/PTTButton';

export default function App() {
  const { localStream, connected, error, initialize, cleanup } = useWebRTC();
  const { transmitting, startTalking, stopTalking } = usePTT({
    localStream,
    connected,
  });

  useEffect(() => {
    initialize();
    return cleanup;
  }, [initialize, cleanup]);

  // Also handle mouseup on window for drag-off-button
  useEffect(() => {
    const onMouseUp = () => stopTalking();
    window.addEventListener('mouseup', onMouseUp);
    return () => window.removeEventListener('mouseup', onMouseUp);
  }, [stopTalking]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-8 p-4">
      <h1 className="text-3xl font-bold tracking-widest text-gray-300 uppercase">
        Frequency
      </h1>

      {error ? (
        <div className="text-red-400 text-center max-w-sm">
          <p className="font-semibold">Error</p>
          <p className="text-sm mt-1">{error}</p>
        </div>
      ) : (
        <>
          <p className="text-sm text-gray-500">
            {connected ? 'Connected to peer' : 'Waiting for peer...'}
          </p>

          <PTTButton
            connected={connected}
            transmitting={transmitting}
            startTalking={startTalking}
            stopTalking={stopTalking}
          />
        </>
      )}

      {!error && !connected && (
        <p className="text-xs text-gray-600 text-center max-w-xs">
          Open this page in two tabs to test push-to-talk voice
        </p>
      )}
    </div>
  );
}
