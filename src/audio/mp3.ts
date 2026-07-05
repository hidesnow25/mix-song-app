import { createMp3Encoder, type WasmMediaEncoder } from 'wasm-media-encoders'

const CHUNK_SIZE = 1152 * 8 // samples encoded per encoder.encode() call
const CHUNKS_PER_YIELD = 50 // how many chunks between event-loop yields

// wasm-media-encoders doesn't export its Mp3CbrValues literal union directly;
// derive it from the public configure() signature so this stays in sync.
type Mp3ConfigureParams = Parameters<WasmMediaEncoder<'audio/mpeg'>['configure']>[0]
export type Mp3Bitrate = NonNullable<Mp3ConfigureParams['bitrate']>

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

/**
 * Encodes stereo audio as an MP3 file using the LAME encoder compiled to
 * WebAssembly (no server/native deps, and no DOM APIs — this runs equally in
 * Node, on the main thread, or inside a Worker). Encoding runs in chunks with
 * periodic event-loop yields so a long encode doesn't freeze whichever
 * thread it runs on for its whole duration. Yields are batched every
 * `CHUNKS_PER_YIELD` chunks rather than every chunk — browsers clamp
 * back-to-back zero-delay timeouts to a several-millisecond minimum, so
 * yielding on every chunk can add more overhead than the encode itself.
 */
export async function encodeMp3(
  left: Float32Array,
  right: Float32Array,
  sampleRate: number,
  kbps: Mp3Bitrate = 192,
): Promise<ArrayBuffer> {
  const encoder = await createMp3Encoder()
  encoder.configure({ channels: 2, sampleRate, bitrate: kbps })

  const numFrames = Math.min(left.length, right.length)
  const chunks: Uint8Array[] = []

  let chunkCount = 0
  for (let i = 0; i < numFrames; i += CHUNK_SIZE) {
    const leftChunk = left.subarray(i, i + CHUNK_SIZE)
    const rightChunk = right.subarray(i, i + CHUNK_SIZE)
    const encoded = encoder.encode([leftChunk, rightChunk])
    // The returned Uint8Array is owned by the encoder and reused on the next
    // call, so it must be copied before encode()/finalize() runs again.
    if (encoded.length > 0) chunks.push(encoded.slice())

    chunkCount++
    if (chunkCount % CHUNKS_PER_YIELD === 0) {
      await yieldToEventLoop()
    }
  }

  const final = encoder.finalize()
  if (final.length > 0) chunks.push(final.slice())

  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const result = new Uint8Array(totalLength)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.length
  }
  return result.buffer
}
