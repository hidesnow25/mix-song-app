import { Mp3Encoder } from '@breezystack/lamejs'
import { floatsToInt16 } from './pcm'

const SAMPLES_PER_FRAME = 1152 // block size expected by lamejs's encoder

/** Encodes stereo audio as an MP3 file using a pure-JS encoder (no server/native deps). */
export function encodeMp3(left: Float32Array, right: Float32Array, sampleRate: number, kbps = 192): ArrayBuffer {
  const leftInt16 = floatsToInt16(left)
  const rightInt16 = floatsToInt16(right)
  const numFrames = Math.min(leftInt16.length, rightInt16.length)

  const encoder = new Mp3Encoder(2, sampleRate, kbps)
  const chunks: Uint8Array[] = []

  for (let i = 0; i < numFrames; i += SAMPLES_PER_FRAME) {
    const leftChunk = leftInt16.subarray(i, i + SAMPLES_PER_FRAME)
    const rightChunk = rightInt16.subarray(i, i + SAMPLES_PER_FRAME)
    const encoded = encoder.encodeBuffer(leftChunk, rightChunk)
    if (encoded.length > 0) chunks.push(encoded)
  }
  const remaining = encoder.flush()
  if (remaining.length > 0) chunks.push(remaining)

  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const result = new Uint8Array(totalLength)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.length
  }
  return result.buffer
}
