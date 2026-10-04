// The browser produces mono, 16 kHz, 16-bit PCM WAV. Check the actual data length,
// not a client-supplied duration, before uploading or spending on transcription.
export function recordingFitsDuration(buffer: ArrayBuffer, maximumSeconds: number): boolean {
  if (buffer.byteLength < 44) return false
  const view = new DataView(buffer)
  const tag = (offset: number) => String.fromCharCode(...new Uint8Array(buffer, offset, 4))
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE' || view.getUint32(4, true) + 8 !== buffer.byteLength)
    return false
  let dataSize = 0
  let formatFound = false
  let dataFound = false
  for (let offset = 12; offset < buffer.byteLength;) {
    if (offset + 8 > buffer.byteLength) return false
    const kind = tag(offset)
    const size = view.getUint32(offset + 4, true)
    const start = offset + 8
    if (start + size > buffer.byteLength) return false
    if (kind === 'fmt ') {
      if (
        formatFound ||
        size < 16 ||
        view.getUint16(start, true) !== 1 ||
        view.getUint16(start + 2, true) !== 1 ||
        view.getUint32(start + 4, true) !== 16_000 ||
        view.getUint32(start + 8, true) !== 32_000 ||
        view.getUint16(start + 12, true) !== 2 ||
        view.getUint16(start + 14, true) !== 16
      )
        return false
      formatFound = true
    }
    if (kind === 'data') {
      if (dataFound || size === 0 || size % 2 !== 0) return false
      dataFound = true
      dataSize = size
    }
    offset = start + size + (size % 2)
    if (offset > buffer.byteLength) return false
  }
  return formatFound && dataFound && dataSize <= maximumSeconds * 32_000
}
