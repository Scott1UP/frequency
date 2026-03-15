import { useCallback } from 'react';

interface PTTButtonProps {
  connected: boolean;
  transmitting: boolean;
  startTalking: () => void;
  stopTalking: () => void;
}

export default function PTTButton({
  connected,
  transmitting,
  startTalking,
  stopTalking,
}: PTTButtonProps) {
  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      e.preventDefault();
      startTalking();
    },
    [startTalking],
  );

  const onTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      e.preventDefault();
      stopTalking();
    },
    [stopTalking],
  );

  const label = !connected
    ? 'CONNECTING...'
    : transmitting
      ? 'TRANSMITTING'
      : 'HOLD TO TALK';

  const ringColor = !connected
    ? 'ring-gray-700'
    : transmitting
      ? 'ring-red-500'
      : 'ring-gray-600';

  const bgColor = !connected
    ? 'bg-gray-800'
    : transmitting
      ? 'bg-red-600'
      : 'bg-gray-700';

  const textColor = !connected
    ? 'text-gray-500'
    : transmitting
      ? 'text-white'
      : 'text-gray-200';

  return (
    <div className="flex flex-col items-center gap-4">
      <button
        type="button"
        disabled={!connected}
        className={`
          w-40 h-40 rounded-full ring-4 ${ringColor} ${bgColor} ${textColor}
          text-lg font-bold tracking-wider
          select-none touch-none
          transition-all duration-100
          ${connected && !transmitting ? 'hover:bg-gray-600 active:bg-red-600 active:ring-red-500 active:text-white cursor-pointer' : ''}
          ${!connected ? 'cursor-not-allowed opacity-60' : ''}
        `}
        onMouseDown={connected ? startTalking : undefined}
        onMouseUp={connected ? stopTalking : undefined}
        onTouchStart={connected ? onTouchStart : undefined}
        onTouchEnd={connected ? onTouchEnd : undefined}
      >
        {label}
      </button>
      {connected && !transmitting && (
        <p className="text-sm text-gray-500">or hold SPACEBAR</p>
      )}
    </div>
  );
}
