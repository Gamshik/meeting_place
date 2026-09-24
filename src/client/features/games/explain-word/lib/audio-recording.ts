export function preferredMimeType() {
  return ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((type) =>
    MediaRecorder.isTypeSupported(type),
  )
}

export async function convertRecordingToWav(recording: Blob) {
  const decodingContext = new AudioContext()
  let decoded: AudioBuffer
  try {
    decoded = await decodingContext.decodeAudioData(await recording.arrayBuffer())
  } finally {
    await decodingContext.close()
  }

  const sampleRate = 16_000
  const frameCount = Math.max(1, Math.ceil(decoded.duration * sampleRate))
  const renderingContext = new OfflineAudioContext(1, frameCount, sampleRate)
  const source = renderingContext.createBufferSource()
  source.buffer = decoded
  source.connect(renderingContext.destination)
  source.start()
  const rendered = await renderingContext.startRendering()
  return encodePcmWav(rendered.getChannelData(0), sampleRate)
}

function encodePcmWav(samples: Float32Array, sampleRate: number) {
  const bytesPerSample = 2
  const buffer = new ArrayBuffer(44 + samples.length * bytesPerSample)
  const view = new DataView(buffer)
  writeAscii(view, 0, 'RIFF')
  view.setUint32(4, 36 + samples.length * bytesPerSample, true)
  writeAscii(view, 8, 'WAVE')
  writeAscii(view, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * bytesPerSample, true)
  view.setUint16(32, bytesPerSample, true)
  view.setUint16(34, 16, true)
  writeAscii(view, 36, 'data')
  view.setUint32(40, samples.length * bytesPerSample, true)
  samples.forEach((sample, index) => {
    const clipped = Math.max(-1, Math.min(1, sample))
    view.setInt16(
      44 + index * bytesPerSample,
      clipped < 0 ? clipped * 0x8000 : clipped * 0x7fff,
      true,
    )
  })
  return new Blob([buffer], { type: 'audio/wav' })
}

function writeAscii(view: DataView, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index))
  }
}
