import { useEffect } from 'react';
import { useWebRTC } from './hooks/useWebRTC';
import { usePTT } from './hooks/usePTT';
import PTTButton from './components/PTTButton';

export default function App() {
  const {
    localStream,
    connected,
    roomConnected,
    peerCount,
    error,
    initialize,
    cleanup,
  } = useWebRTC();

  const { transmitting, startTalking, stopTalking } = usePTT({
    localStream,
    connected,
  });

  // Clean up on unmount only
  useEffect(() => cleanup, [cleanup]);

  // Handle mouseup on window for drag-off-button
  useEffect(() => {
    const onMouseUp = () => stopTalking();
    window.addEventListener('mouseup', onMouseUp);
    return () => window.removeEventListener('mouseup', onMouseUp);
  }, [stopTalking]);

  // Not yet started — show join button
  if (!localStream && !error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-8 p-4">
        <h1 className="text-3xl font-bold tracking-widest text-gray-300 uppercase">
          Frequency
        </h1>
        <button
          onClick={initialize}
          className="px-8 py-4 rounded-full bg-gray-700 text-gray-200 text-lg font-semibold hover:bg-gray-600 active:bg-gray-500 transition-colors"
        >
          Join Room
        </button>
        <p className="text-xs text-gray-600 text-center max-w-xs">
          Make sure the signalling server is running: cd apps/server && npm run dev
        </p>
      </div>
    );
  }

  const statusText = error
    ? null
    : connected
      ? `Connected — ${peerCount} in room`
      : roomConnected
        ? 'In room, waiting for peers...'
        : 'Connecting to server...';

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
          <p className="text-sm text-gray-500">{statusText}</p>

          <PTTButton
            connected={connected}
            transmitting={transmitting}
            startTalking={startTalking}
            stopTalking={stopTalking}
          />
        </>
      )}
    </div>
  );
}
