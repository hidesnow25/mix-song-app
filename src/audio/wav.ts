import { floatSampleToInt16 } from './pcm'

/** Encodes interleaved 16-bit PCM stereo audio as a standard RIFF/WAVE file. */
export function encodeWavPCM16(left: Float32Array, right: Float32Array, sampleRate: number): ArrayBuffer {
  const numFrames = Math.min(left.length, right.length)
  const numChannels = 2
  const bytesPerSample = 2
  const blockAlign = numChannels * bytesPerSample
  const dataSize = numFrames * blockAlign
  const buffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buffer)

  writeString(view, 0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeString(view, 8, 'WAVE')
  writeString(view, 12, 'fmt ')
  view.setUint32(16, 16, true) // fmt chunk size
  view.setUint16(20, 1, true) // PCM format
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * blockAlign, true) // byte rate
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, 16, true) // bits per sample
  writeString(view, 36, 'data')
  view.setUint32(40, dataSize, true)

  let offset = 44
  for (let i = 0; i < numFrames; i++) {
    view.setInt16(offset, floatSampleToInt16(left[i]), true)
    offset += 2
    view.setInt16(offset, floatSampleToInt16(right[i]), true)
    offset += 2
  }

  return buffer
}

function writeString(view: DataView, offset: number, value: string): void {
  for (let i = 0; i < value.length; i++) {
    view.setUint8(offset + i, value.charCodeAt(i))
  }
}
