import { Mp3Encoder } from '@breezystack/lamejs'
import { floatsToInt16 } from './pcm'

const SAMPLES_PER_FRAME = 1152 // block size expected by lamejs's encoder
const FRAMES_PER_YIELD = 50 // periodically hand control back to the event loop during long encodes

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

/**
 * Encodes stereo audio as an MP3 file using a pure-JS encoder (no server/native
 * deps). Encoding runs in chunks with periodic event-loop yields so a long
 * encode doesn't freeze the tab for its whole duration (letting a "processing"
 * UI actually stay responsive/visible).
 */
export async function encodeMp3(
  left: Float32Array,
  right: Float32Array,
  sampleRate: number,
  kbps = 192,
): Promise<ArrayBuffer> {
  const leftInt16 = floatsToInt16(left)
  const rightInt16 = floatsToInt16(right)
  const numFrames = Math.min(leftInt16.length, rightInt16.length)

  const encoder = new Mp3Encoder(2, sampleRate, kbps)
  const chunks: Uint8Array[] = []

  let framesSinceYield = 0
  for (let i = 0; i < numFrames; i += SAMPLES_PER_FRAME) {
    const leftChunk = leftInt16.subarray(i, i + SAMPLES_PER_FRAME)
    const rightChunk = rightInt16.subarray(i, i + SAMPLES_PER_FRAME)
    const encoded = encoder.encodeBuffer(leftChunk, rightChunk)
    if (encoded.length > 0) chunks.push(encoded)

    framesSinceYield++
    if (framesSinceYield >= FRAMES_PER_YIELD) {
      framesSinceYield = 0
      await yieldToEventLoop()
    }
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
