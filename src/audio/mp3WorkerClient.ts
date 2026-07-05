// Browser-only glue: runs the MP3 encode in a dedicated Worker so it never
// occupies the main thread, keeping the UI fully responsive during long
// encodes. Mirrors decode.ts as the seam that isolates a browser-specific
// API (Worker) from the pure engine logic in mp3.ts.
import type { Mp3Bitrate } from './mp3'

let worker: Worker | null = null

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./mp3.worker.ts', import.meta.url), { type: 'module' })
  }
  return worker
}

export function encodeMp3InWorker(
  left: Float32Array,
  right: Float32Array,
  sampleRate: number,
  kbps: Mp3Bitrate = 192,
): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const w = getWorker()

    const handleMessage = (event: MessageEvent<{ buffer?: ArrayBuffer; error?: string }>) => {
      cleanup()
      if (event.data.error) reject(new Error(event.data.error))
      else resolve(event.data.buffer!)
    }
    const handleError = (event: ErrorEvent) => {
      cleanup()
      reject(event.error ?? new Error(event.message))
    }
    function cleanup() {
      w.removeEventListener('message', handleMessage)
      w.removeEventListener('error', handleError)
    }

    w.addEventListener('message', handleMessage)
    w.addEventListener('error', handleError)

    // Transfer ownership of the underlying buffers to the worker to avoid a
    // copy — left/right must not be reused by the caller after this call.
    w.postMessage({ left: left.buffer, right: right.buffer, sampleRate, kbps }, [left.buffer, right.buffer])
  })
}
