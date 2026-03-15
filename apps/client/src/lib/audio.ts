export async function acquireMicrophone(): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
    video: false,
  });
}

export function setMicEnabled(stream: MediaStream, enabled: boolean): void {
  for (const track of stream.getAudioTracks()) {
    track.enabled = enabled;
  }
}

export function releaseMicrophone(stream: MediaStream): void {
  for (const track of stream.getTracks()) {
    track.stop();
  }
}
